from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from forecasting.analysis.ensemble_engine import EnsembleEngine
from forecasting.analysis.forecast_series import pick_forecast_payload
from forecasting.analysis.scenario_classifier import ScenarioClassifier
from forecasting.api.fred_api import FREDClient
from forecasting.api.sybilion_forecast_api import SybilionForecastApiClient
from forecasting.payloads.fed_rate_payloads import FedRatePayloadBuilder


class FedRatePipeline:
    """
    Orchestriert den gesamten Fed-Rate-Forecast-Prozess:

    1. FRED-Daten holen
    2. Sybilion-Jobs parallel submitten und pollen
    3. Ensemble-Forecast berechnen
    4. Szenario klassifizieren

    Alle Abhängigkeiten sind optional injizierbar (für Tests / Mocking).
    """

    def __init__(
        self,
        fred_client: FREDClient | None = None,
        forecast_client: SybilionForecastApiClient | None = None,
        payload_builder: FedRatePayloadBuilder | None = None,
        ensemble_engine: EnsembleEngine | None = None,
        scenario_classifier: ScenarioClassifier | None = None,
        pipeline_version: str = "v1",
        artifacts_base_dir: str = "artifacts/fed_rate_forecast",
    ):
        fred = fred_client or FREDClient()
        self.fred_client         = fred
        self.forecast_client     = forecast_client or SybilionForecastApiClient()
        self.payload_builder     = payload_builder or FedRatePayloadBuilder(fred, pipeline_version=pipeline_version)
        self.ensemble_engine     = ensemble_engine or EnsembleEngine()
        self.scenario_classifier = scenario_classifier or ScenarioClassifier()
        self.artifacts_base_dir  = artifacts_base_dir

    def run(
        self,
        signal_configs: list[dict],
        max_workers: int = 4,
    ) -> dict:
        """
        Führt die komplette Pipeline aus.

        Returns:
        {
            "signals":  { series_id: { job, forecast, weight, series_id } },
            "ensemble": { ensemble_forecast, contributing_signals, ... },
            "scenario": { scenario, confidence, delta_3m, ... },
        }
        """
        signals  = self._run_signals_parallel(signal_configs, max_workers)
        ensemble = self._synthesize_ensemble(signals)
        scenario = self._classify_scenario(ensemble, signals, signal_configs)

        return {
            "signals":  signals,
            "ensemble": ensemble,
            "scenario": scenario,
        }

    def get_drivers(
        self,
        series_id: str = "FEDFUNDS",
        periods: int = 60,
        output_path: str | None = None,
    ) -> dict:
        """Ruft Sybilion Drivers für eine einzelne Serie ab."""
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

    def _run_signals_parallel(
        self,
        signal_configs: list[dict],
        max_workers: int,
    ) -> dict:
        """Schickt alle Signale parallel an Sybilion und sammelt Ergebnisse."""
        results = {}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(self._run_single_signal, cfg): cfg["series_id"]
                for cfg in signal_configs
            }
            for future in as_completed(futures):
                series_id = futures[future]
                try:
                    results[series_id] = future.result()
                    print(f"✓ {series_id} abgeschlossen")
                except Exception as e:
                    print(f"✗ {series_id} fehlgeschlagen: {e}")
                    results[series_id] = None

        return results

    def _synthesize_ensemble(self, signals: dict) -> dict:
        """Führt die Sybilion-Forecasts zu einem gewichteten Ensemble zusammen."""
        print("-> Erzeuge Ensemble Forecast...")
        return self.ensemble_engine.synthesize(signals)

    def _classify_scenario(self, ensemble: dict, signals: dict, signal_configs: list[dict]) -> dict:
        """Leitet das Szenario aus Ensemble + Rohsignalen ab."""
        print("-> Klassifiziere Szenario...")
        return self.scenario_classifier.classify(ensemble, signals, signal_configs)

    def _run_single_signal(self, cfg: dict) -> dict:
        payload = self.payload_builder.build_forecast_payload(
            series_id=cfg["series_id"],
            recency_factor=cfg["recency_factor"],
        )
        output_dir = os.path.join(self.artifacts_base_dir, cfg["series_id"])
        job, artifacts = self._submit_and_poll(payload, output_dir)

        return {
            "series_id": cfg["series_id"],
            "weight":    cfg["weight"],
            "job":       job,
            "forecast":  pick_forecast_payload(artifacts),
        }

    def _submit_and_poll(
        self,
        payload: dict,
        output_dir: str,
        poll_interval_s: float = 10.0,
        timeout_s: float = 3600.0,
    ) -> tuple[dict, dict]:
        """Submittet einen Sybilion-Job, pollt bis settled, lädt Artifacts herunter."""
        job_id = self.forecast_client.submit_forecast(payload)

        deadline = time.monotonic() + timeout_s
        while True:
            job    = self.forecast_client.get_forecast_status(job_id)
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
        """Lädt alle Artifacts eines abgeschlossenen Jobs herunter."""
        os.makedirs(output_dir, exist_ok=True)
        downloaded = {}

        for artifact in job.get("artifacts") or []:
            name     = artifact["name"]
            response = self.forecast_client.download_artifact(job_id, name)
            path     = os.path.join(output_dir, name)

            with open(path, "wb") as f:
                f.write(response.content)

            downloaded[name] = response.json() if name.endswith(".json") else path

        return downloaded
