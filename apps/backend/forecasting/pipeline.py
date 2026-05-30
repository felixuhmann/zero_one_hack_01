from __future__ import annotations

import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from forecasting.analysis.ensemble_engine import EnsembleEngine
from forecasting.analysis.forecast_series import pick_forecast_payload
from forecasting.analysis.scenario_classifier import ScenarioClassifier
from forecasting.artifacts_cache import has_cached_signal, load_cached_signal
from forecasting.api.fred_api import FREDClient
from forecasting.api.sybilion_forecast_api import SybilionForecastApiClient
from forecasting.payloads.base_payload_builder import BasePayloadBuilder
from forecasting.payloads.fed_rate_payloads import FedRatePayloadBuilder

logger = logging.getLogger(__name__)


def serialize_result(result: dict) -> dict:
    """JSON-safe view of :meth:`RateForecastPipeline.run` output.

    Canonical serializer shared by the REST endpoint and the chat tools so the
    pipeline's output contract lives in exactly one place.
    """
    signals_out: dict = {}
    for series_id, item in result.get("signals", {}).items():
        if item is None:
            signals_out[series_id] = None
            continue
        signals_out[series_id] = {
            "series_id": item["series_id"],
            "weight": item["weight"],
            "job": item["job"],
            "forecast": item.get("forecast"),
        }

    return {
        "signals": signals_out,
        "ensemble": result.get("ensemble"),
        "scenario": result.get("scenario"),
    }


class RateForecastPipeline:
    """Orchestrates the full central-bank rate forecast process for one region.

    Region-agnostic: the injected ``payload_builder`` and the ``signal_configs``
    passed to :meth:`run` determine whether this forecasts Fed, ECB, or any
    other central bank. The Fed builder is the default for convenience only.

    Steps:
        1. Fetch FRED data
        2. Submit Sybilion jobs in parallel and poll them
        3. Compute the weighted ensemble forecast
        4. Classify the scenario

    All dependencies are optionally injectable (for tests / mocking).
    """

    def __init__(
        self,
        fred_client: FREDClient | None = None,
        forecast_client: SybilionForecastApiClient | None = None,
        payload_builder: BasePayloadBuilder | None = None,
        ensemble_engine: EnsembleEngine | None = None,
        scenario_classifier: ScenarioClassifier | None = None,
        pipeline_version: str = "v1",
        artifacts_base_dir: str = "artifacts/fed_rate_forecast",
    ):
        fred = fred_client or FREDClient()
        self.fred_client = fred
        self.forecast_client = forecast_client or SybilionForecastApiClient()
        self.payload_builder = payload_builder or FedRatePayloadBuilder(
            fred, pipeline_version=pipeline_version
        )
        self.ensemble_engine = ensemble_engine or EnsembleEngine()
        self.scenario_classifier = scenario_classifier or ScenarioClassifier()
        self.artifacts_base_dir = artifacts_base_dir

    def run(
        self,
        signal_configs: list[dict],
        max_workers: int = 4,
        *,
        use_cache: bool = True,
    ) -> dict:
        """Run the complete pipeline.

        Returns:
        {
            "signals":  { series_id: { job, forecast, weight, series_id } },
            "ensemble": { ensemble_forecast, contributing_signals, ... },
            "scenario": { scenario, confidence, delta_3m, ... },
        }
        """
        needs_fetch = [
            cfg
            for cfg in signal_configs
            if not (use_cache and has_cached_signal(self.artifacts_base_dir, cfg["series_id"]))
        ]
        timeseries_cache = (
            self._prefetch_fred_timeseries(needs_fetch) if needs_fetch else {}
        )
        signals = self._run_signals_parallel(
            signal_configs, max_workers, timeseries_cache, use_cache=use_cache
        )
        ensemble = self._synthesize_ensemble(signals)
        scenario = self._classify_scenario(ensemble, signals, signal_configs)

        return {
            "signals": signals,
            "ensemble": ensemble,
            "scenario": scenario,
            "signal_configs": signal_configs,
        }

    def get_drivers(
        self,
        series_id: str = "FEDFUNDS",
        periods: int = 60,
        output_path: str | None = None,
    ) -> dict:
        """Fetch Sybilion drivers for a single series."""
        payload = self.payload_builder.build_drivers_payload(
            series_id=series_id,
            periods=periods,
        )
        result = self.forecast_client.get_drivers(payload=payload)

        if output_path:
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2)

        return result

    def _prefetch_fred_timeseries(self, signal_configs: list[dict]) -> dict[str, dict]:
        """Fetch all FRED series sequentially (avoids FRED HTTP 429 under parallel load)."""
        cache: dict[str, dict] = {}
        for cfg in signal_configs:
            series_id = cfg["series_id"]
            logger.info("fetching FRED series %s", series_id)
            cache[series_id] = self.payload_builder.fetch_timeseries(series_id)
        return cache

    def _run_signals_parallel(
        self,
        signal_configs: list[dict],
        max_workers: int,
        timeseries_cache: dict[str, dict],
        *,
        use_cache: bool = True,
    ) -> dict:
        """Submit all signals to Sybilion in parallel and collect results."""
        results = {}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self._run_single_signal,
                    cfg,
                    timeseries_cache.get(cfg["series_id"]),
                    use_cache,
                ): cfg["series_id"]
                for cfg in signal_configs
            }
            for future in as_completed(futures):
                series_id = futures[future]
                try:
                    results[series_id] = future.result()
                    logger.info("signal %s completed", series_id)
                except Exception:
                    logger.exception("signal %s failed", series_id)
                    results[series_id] = None

        return results

    def _synthesize_ensemble(self, signals: dict) -> dict:
        """Combine the Sybilion forecasts into a weighted ensemble."""
        logger.info("building ensemble forecast")
        return self.ensemble_engine.synthesize(signals)

    def _classify_scenario(
        self, ensemble: dict, signals: dict, signal_configs: list[dict]
    ) -> dict:
        """Derive the scenario from the ensemble + raw signals."""
        logger.info("classifying scenario")
        return self.scenario_classifier.classify(ensemble, signals, signal_configs)

    def _run_single_signal(
        self,
        cfg: dict,
        timeseries: dict[str, float] | None = None,
        use_cache: bool = True,
    ) -> dict:
        series_id = cfg["series_id"]
        if use_cache and has_cached_signal(self.artifacts_base_dir, series_id):
            return load_cached_signal(cfg, self.artifacts_base_dir)

        output_dir = os.path.join(self.artifacts_base_dir, series_id)
        os.makedirs(output_dir, exist_ok=True)

        payload = self.payload_builder.build_forecast_payload(
            series_id=series_id,
            recency_factor=cfg["recency_factor"],
            timeseries=timeseries,
        )
        with open(
            os.path.join(output_dir, "submit_payload.json"),
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(payload, f, indent=2)

        job, artifacts = self._submit_and_poll(payload, output_dir)

        json_artifacts = {
            name.removesuffix(".json"): payload
            for name, payload in artifacts.items()
            if name.endswith(".json") and isinstance(payload, dict)
        }

        return {
            "series_id": cfg["series_id"],
            "weight": cfg["weight"],
            "job": job,
            "forecast": pick_forecast_payload(artifacts),
            "artifacts": json_artifacts,
        }

    def _submit_and_poll(
        self,
        payload: dict,
        output_dir: str,
        poll_interval_s: float = 10.0,
        timeout_s: float = 3600.0,
    ) -> tuple[dict, dict]:
        """Submit a Sybilion job, poll until settled, download artifacts."""
        job_id = self.forecast_client.submit_forecast(payload)

        deadline = time.monotonic() + timeout_s
        status: str | None = None
        while True:
            try:
                job = self.forecast_client.get_forecast_status(job_id)
            except (requests.RequestException, RuntimeError) as exc:
                if time.monotonic() > deadline:
                    raise TimeoutError(
                        f"Job {job_id} did not settle within {timeout_s}s "
                        f"(last status={status!r})"
                    ) from exc
                logger.warning(
                    "Sybilion status poll for job %s failed: %s; retrying",
                    job_id,
                    exc,
                )
                time.sleep(poll_interval_s)
                continue

            status = job.get("status")
            settled = job.get("settled")

            if settled is True:
                break
            if status in ("failed", "canceled"):
                raise RuntimeError(
                    f"Job {job_id} ended with status={status!r}: "
                    f"{job.get('pipeline_error')}"
                )
            if time.monotonic() > deadline:
                raise TimeoutError(
                    f"Job {job_id} did not settle within {timeout_s}s "
                    f"(last status={status!r})"
                )

            time.sleep(poll_interval_s)

        if status != "completed":
            raise RuntimeError(
                f"Job {job_id} settled with status={status!r}: "
                f"{job.get('pipeline_error')}"
            )

        return job, self._download_artifacts(job, job_id, output_dir)

    def _download_artifacts(
        self,
        job: dict,
        job_id: str,
        output_dir: str,
    ) -> dict:
        """Download all artifacts of a completed job."""
        os.makedirs(output_dir, exist_ok=True)
        downloaded = {}

        for artifact in job.get("artifacts") or []:
            name = artifact["name"]
            response = self.forecast_client.download_artifact(job_id, name)
            path = os.path.join(output_dir, name)

            with open(path, "wb") as f:
                f.write(response.content)

            downloaded[name] = response.json() if name.endswith(".json") else path

        return downloaded
