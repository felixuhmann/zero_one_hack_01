"""Load completed Sybilion forecast artifacts from disk (skip API re-run)."""

from __future__ import annotations

import json
import logging
import os

from forecasting.analysis.forecast_series import pick_forecast_payload

logger = logging.getLogger(__name__)

# Keep in sync with ``forecast_aggregator.SYBILION_ARTIFACT_FILES``.
SYBILION_ARTIFACT_FILES = (
    "forecast.json",
    "external_signals.json",
    "backtest_metrics.json",
    "backtest_trajectories.json",
    "input.json",
)

# Minimum files required to treat a signal as complete (charts + ensemble).
REQUIRED_CACHED_FILES = ("forecast.json", "input.json")


def _artifact_key(filename: str) -> str:
    return filename.removesuffix(".json")


def series_artifacts_dir(artifacts_base_dir: str, series_id: str) -> str:
    return os.path.join(artifacts_base_dir, series_id)


def has_cached_signal(artifacts_base_dir: str, series_id: str) -> bool:
    series_dir = series_artifacts_dir(artifacts_base_dir, series_id)
    return all(
        os.path.isfile(os.path.join(series_dir, name)) for name in REQUIRED_CACHED_FILES
    )


def load_cached_signal(cfg: dict, artifacts_base_dir: str) -> dict:
    """Rebuild the in-memory signal dict from on-disk Sybilion artifacts."""
    series_id = cfg["series_id"]
    series_dir = series_artifacts_dir(artifacts_base_dir, series_id)

    artifacts: dict = {}
    for name in SYBILION_ARTIFACT_FILES:
        path = os.path.join(series_dir, name)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, (dict, list)):
            artifacts[_artifact_key(name)] = payload

    on_disk = {
        name: artifacts[_artifact_key(name)]
        for name in SYBILION_ARTIFACT_FILES
        if _artifact_key(name) in artifacts
    }
    forecast = pick_forecast_payload(on_disk) or artifacts.get("forecast")

    logger.info("using cached Sybilion artifacts for %s", series_id)

    return {
        "series_id": series_id,
        "weight": cfg["weight"],
        "job": {
            "status": "completed",
            "job_id": "cached",
            "source": "disk",
        },
        "forecast": forecast,
        "artifacts": artifacts,
        "cached": True,
    }
