"""Aggregate Sybilion job artifacts into one JSON document for the API.

Reference shapes live in:

- ``forecasting/example_artefacts/`` — minimal examples per file type
- ``artifacts/fed_rate_forecast/<SERIES_ID>/`` — full multi-signal run output

Each completed Sybilion forecast job provides (among others):

- ``forecast.json`` — ``data.forecast_series`` with median + ``quantile_forecast``
- ``external_signals.json`` — driver importance / direction / correlation by horizon
- ``backtest_metrics.json`` — MAE/RMSE etc. per backtest window
- ``backtest_trajectories.json`` — held-out actuals vs quantile fan
- ``input.json`` — submitted payload echo
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

from forecasting.analysis.forecast_series import extract_forecast_series_from_signal
from forecasting.catalog.fed_data_sources import sources_for_response
from forecasting.pipeline import serialize_result
from forecasting.regions import RegionConfig

AGGREGATED_FILENAME = "aggregated_forecast.json"
AGGREGATE_VERSION = "2.1"

SYBILION_ARTIFACT_FILES = (
    "forecast.json",
    "external_signals.json",
    "backtest_metrics.json",
    "backtest_trajectories.json",
    "input.json",
)


def _role_name(role: object) -> str | None:
    if role is None:
        return None
    return getattr(role, "value", str(role))


def _load_json_file(path: str) -> dict | list | None:
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, (dict, list)) else None


def _artifact_key(filename: str) -> str:
    return filename.removesuffix(".json")


def _resolve_artifacts(signal: dict | None, series_dir: str) -> dict[str, Any]:
    """Merge in-memory job downloads with files under ``series_dir``."""
    out: dict[str, Any] = {}
    in_memory = signal.get("artifacts") if signal else None
    if isinstance(in_memory, dict):
        for name in SYBILION_ARTIFACT_FILES:
            key = _artifact_key(name)
            if key in in_memory and in_memory[key] is not None:
                out[key] = in_memory[key]
            elif name in in_memory and in_memory[name] is not None:
                out[key] = in_memory[name]

    for name in SYBILION_ARTIFACT_FILES:
        key = _artifact_key(name)
        if key in out:
            continue
        payload = _load_json_file(os.path.join(series_dir, name))
        if payload is not None:
            out[key] = payload

    return out


def _aggregate_signal(
    series_id: str,
    signal: dict | None,
    cfg: dict | None,
    artifacts_base_dir: str,
) -> dict[str, Any]:
    if signal is None:
        return {
            "series_id": series_id,
            "status": "failed",
            "weight": cfg.get("weight") if cfg else None,
            "role": _role_name(cfg.get("role")) if cfg else None,
            "artifacts": {},
            "forecast_series": {},
        }

    job = signal.get("job") if isinstance(signal.get("job"), dict) else {}
    series_dir = os.path.join(artifacts_base_dir, series_id)
    artifacts = _resolve_artifacts(signal, series_dir)
    forecast_series = extract_forecast_series_from_signal(signal)

    return {
        "series_id": series_id,
        "status": job.get("status"),
        "job_id": job.get("job_id") or job.get("id"),
        "weight": signal.get("weight"),
        "role": _role_name(cfg.get("role")) if cfg else None,
        "recency_factor": cfg.get("recency_factor") if cfg else None,
        "artifacts": artifacts,
        "forecast_series": forecast_series,
    }


def aggregate_pipeline_result(
    region: RegionConfig,
    result: dict,
    *,
    signal_configs: list[dict] | None = None,
    generated_at_ms: int | None = None,
) -> dict[str, Any]:
    """Build the canonical aggregated document from a pipeline run.

    ``signals`` contains one entry per *selected* series (frontend checkbox set),
    each with full Sybilion artifacts when the job completed.
    """
    configs = signal_configs or result.get("signal_configs") or region.signal_configs
    cfg_by_id = {cfg["series_id"]: cfg for cfg in configs if cfg.get("series_id")}
    selected_ids = list(cfg_by_id.keys())
    signals_in = result.get("signals") or {}

    signals_out: dict[str, Any] = {}
    for series_id in selected_ids:
        signals_out[series_id] = _aggregate_signal(
            series_id,
            signals_in.get(series_id),
            cfg_by_id.get(series_id),
            region.artifacts_dir,
        )

    target_series_id = None
    for cfg in configs:
        if _role_name(cfg.get("role")) == "target":
            target_series_id = cfg["series_id"]
            break

    ensemble = result.get("ensemble") or {}
    data_sources = (
        sources_for_response(selected_ids, configs)
        if region.key == "fed"
        else []
    )

    return {
        "version": AGGREGATE_VERSION,
        "region": region.key,
        "region_label": region.label,
        "generated_at": generated_at_ms or int(time.time() * 1000),
        "target_series_id": target_series_id,
        "included_series_ids": selected_ids,
        "data_sources": data_sources,
        "signal_configs": [
            {
                "series_id": cfg["series_id"],
                "weight": cfg.get("weight"),
                "recency_factor": cfg.get("recency_factor"),
                "role": _role_name(cfg.get("role")),
            }
            for cfg in configs
        ],
        "signals": signals_out,
        "ensemble": {
            "ensemble_forecast": ensemble.get("ensemble_forecast") or {},
            "contributing_signals": ensemble.get("contributing_signals") or [],
            "normalized_weights": ensemble.get("normalized_weights") or {},
            "dropped_signals": ensemble.get("dropped_signals") or [],
            "backtest": ensemble.get("backtest") or {},
        },
    }


def _compat_signals_view(aggregated_signals: dict[str, Any]) -> dict[str, Any]:
    """Flatten aggregated signals for clients that expect ``forecast`` on each row."""
    out: dict[str, Any] = {}
    for series_id, sig in aggregated_signals.items():
        if sig is None:
            out[series_id] = None
            continue
        artifacts = sig.get("artifacts") if isinstance(sig.get("artifacts"), dict) else {}
        out[series_id] = {
            "series_id": series_id,
            "weight": sig.get("weight"),
            "job": {
                "status": sig.get("status"),
                "job_id": sig.get("job_id"),
            },
            "forecast": artifacts.get("forecast"),
            "artifacts": artifacts,
            "forecast_series": sig.get("forecast_series") or {},
        }
    return out


def build_forecast_api_response(
    region: RegionConfig,
    result: dict,
    *,
    signal_configs: list[dict] | None = None,
) -> dict[str, Any]:
    """Aggregated Sybilion bundle plus scenario and dashboard-compat signal rows."""
    configs = signal_configs or result.get("signal_configs")
    aggregated = aggregate_pipeline_result(
        region, result, signal_configs=configs
    )
    serialized = serialize_result(result)
    api_body = {
        **aggregated,
        "signals": _compat_signals_view(aggregated["signals"]),
        "ensemble": aggregated["ensemble"],
        "scenario": serialized.get("scenario"),
    }
    path = save_aggregated_forecast(api_body, region.artifacts_dir)
    api_body["snapshot_path"] = path
    return api_body


def aggregated_forecast_path(artifacts_dir: str) -> str:
    return os.path.join(artifacts_dir, AGGREGATED_FILENAME)


def save_aggregated_forecast(aggregated: dict, artifacts_dir: str) -> str:
    path = aggregated_forecast_path(artifacts_dir)
    os.makedirs(artifacts_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(aggregated, f, indent=2)
    return path


def load_aggregated_forecast(artifacts_dir: str) -> dict | None:
    data = _load_json_file(aggregated_forecast_path(artifacts_dir))
    return data if isinstance(data, dict) else None
