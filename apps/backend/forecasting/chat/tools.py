"""Tool registry for the chat agent.

The chat LLM (see :mod:`forecasting.chat.service`) can call these tools to drive
the Sybilion-backed forecasting pipeline and surface results to the user. Each
tool has an OpenAI function schema (advertised to the model) and a Python
executor that reuses the existing pipeline classes.

Design notes:
- Tool *outputs* are compact summaries so they stay cheap to feed back into the
  model and render nicely in the UI tool card. The full pipeline result is also
  persisted to ``<artifacts_dir>/latest.json`` so ``read_latest_forecast`` can
  return an answer instantly without re-running the (slow) pipeline.
- All executors are synchronous and may block (network + polling); the chat
  service runs them off the event loop via ``asyncio.to_thread``.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Callable

from forecasting.analysis.ensemble_engine import EnsembleEngine
from forecasting.analysis.forecast_series import extract_forecast_series_from_signal
from forecasting.analysis.scenario_classifier import ScenarioClassifier
from forecasting.api.fred_api import FREDClient
from forecasting.api.sybilion_forecast_api import SybilionForecastApiClient
from forecasting.fed_rate_pipeline import FedRatePipeline
from forecasting.payloads.ecb_rate_payloads import ECB_SIGNAL_CONFIGS, ECBRatePayloadBuilder
from forecasting.payloads.fed_rate_payloads import US_SIGNAL_CONFIGS, FedRatePayloadBuilder

# Region -> pipeline configuration. Keys mirror the CLI's two pipelines.
REGIONS: dict[str, dict[str, Any]] = {
    "fed": {
        "builder": FedRatePayloadBuilder,
        "signal_configs": US_SIGNAL_CONFIGS,
        "artifacts_dir": "artifacts/fed_rate_forecast",
        "label": "US Federal Reserve (Fed)",
    },
    "ecb": {
        "builder": ECBRatePayloadBuilder,
        "signal_configs": ECB_SIGNAL_CONFIGS,
        "artifacts_dir": "artifacts/ecb",
        "label": "European Central Bank (ECB)",
    },
}

_REGION_ALIASES = {
    "us": "fed",
    "usa": "fed",
    "fed": "fed",
    "fomc": "fed",
    "federal reserve": "fed",
    "united states": "fed",
    "eu": "ecb",
    "euro": "ecb",
    "ecb": "ecb",
    "eurozone": "ecb",
    "euro area": "ecb",
    "europe": "ecb",
}


class ToolError(RuntimeError):
    """Raised when a tool cannot complete; surfaced to the UI as a tool error."""


def _resolve_region(region: str | None) -> str:
    key = (region or "fed").strip().lower()
    key = _REGION_ALIASES.get(key, key)
    if key not in REGIONS:
        raise ToolError(f"Unknown region {region!r}. Use 'fed' or 'ecb'.")
    return key


def _build_pipeline(region_key: str) -> FedRatePipeline:
    fred = FREDClient()
    cfg = REGIONS[region_key]
    return FedRatePipeline(
        fred_client=fred,
        forecast_client=SybilionForecastApiClient(),
        payload_builder=cfg["builder"](fred),
        ensemble_engine=EnsembleEngine(),
        scenario_classifier=ScenarioClassifier(),
        artifacts_base_dir=cfg["artifacts_dir"],
    )


def _serialize_result(result: dict) -> dict:
    """JSON-safe full view of ``pipeline.run()`` (mirrors the API serializer)."""
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


def _summarize_result(result: dict) -> dict:
    """Compact, model-friendly summary of a (fresh or serialized) pipeline result."""
    scenario = result.get("scenario") or {}
    ensemble = result.get("ensemble") or {}
    signals = result.get("signals") or {}

    signal_summaries: dict[str, Any] = {}
    for series_id, item in signals.items():
        if item is None:
            signal_summaries[series_id] = {"status": "failed"}
            continue
        signal_summaries[series_id] = {
            "status": (item.get("job") or {}).get("status"),
            "weight": item.get("weight"),
            "forecast_points": len(extract_forecast_series_from_signal(item)),
        }

    return {
        "scenario": {
            "scenario": scenario.get("scenario"),
            "confidence": scenario.get("confidence"),
            "delta_3m": scenario.get("delta_3m"),
            "delta_6m": scenario.get("delta_6m"),
            "inflation_trend": scenario.get("inflation_trend"),
            "trigger": scenario.get("trigger"),
        },
        "ensemble": {
            "contributing_signals": ensemble.get("contributing_signals"),
            "normalized_weights": ensemble.get("normalized_weights"),
            "dropped_signals": ensemble.get("dropped_signals"),
            "ensemble_forecast": ensemble.get("ensemble_forecast"),
        },
        "signals": signal_summaries,
    }


def _snapshot_path(region_key: str) -> str:
    return os.path.join(REGIONS[region_key]["artifacts_dir"], "latest.json")


def _save_snapshot(region_key: str, serialized: dict) -> str:
    path = _snapshot_path(region_key)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    snapshot = {
        "region": region_key,
        "generated_at": int(time.time() * 1000),
        "result": serialized,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)
    return path


# ----------------------------------------------------------------------------
# Executors
# ----------------------------------------------------------------------------


def run_forecast_pipeline(region: str = "fed", **_: Any) -> dict:
    """Run the full FRED -> Sybilion -> ensemble -> scenario pipeline.

    Slow (parallel Sybilion jobs + polling). Saves a ``latest.json`` snapshot so
    later ``read_latest_forecast`` calls are instant.
    """
    region_key = _resolve_region(region)
    cfg = REGIONS[region_key]
    pipeline = _build_pipeline(region_key)

    result = pipeline.run(signal_configs=cfg["signal_configs"])
    serialized = _serialize_result(result)
    saved_path = _save_snapshot(region_key, serialized)

    summary = _summarize_result(result)
    summary["region"] = region_key
    summary["region_label"] = cfg["label"]
    summary["saved_snapshot"] = saved_path
    return summary


def read_latest_forecast(region: str = "fed", **_: Any) -> dict:
    """Return the most recent saved forecast snapshot for a region (instant)."""
    region_key = _resolve_region(region)
    cfg = REGIONS[region_key]
    path = _snapshot_path(region_key)

    if not os.path.exists(path):
        return {
            "region": region_key,
            "region_label": cfg["label"],
            "available": False,
            "message": (
                f"No saved forecast for {cfg['label']} yet. "
                "Call run_forecast_pipeline first (it can take several minutes)."
            ),
        }

    with open(path, encoding="utf-8") as f:
        snapshot = json.load(f)

    summary = _summarize_result(snapshot.get("result") or {})
    summary["region"] = region_key
    summary["region_label"] = cfg["label"]
    summary["available"] = True
    summary["generated_at"] = snapshot.get("generated_at")
    return summary


def get_forecast_drivers(
    region: str = "fed",
    series_id: str | None = None,
    periods: int = 60,
    **_: Any,
) -> dict:
    """Fetch Sybilion drivers (key explanatory features) for a single series."""
    region_key = _resolve_region(region)
    cfg = REGIONS[region_key]
    resolved_series = series_id or cfg["signal_configs"][0]["series_id"]
    try:
        periods_int = int(periods)
    except (TypeError, ValueError):
        periods_int = 60

    pipeline = _build_pipeline(region_key)
    drivers = pipeline.get_drivers(series_id=resolved_series, periods=periods_int)

    return {
        "region": region_key,
        "region_label": cfg["label"],
        "series_id": resolved_series,
        "periods": periods_int,
        "drivers": drivers,
    }


_REGION_PARAM = {
    "type": "string",
    "enum": ["fed", "ecb"],
    "description": "Central bank region: 'fed' (US Federal Reserve) or 'ecb' (European Central Bank).",
}

# OpenAI-style function tool schemas advertised to the model.
TOOL_SPECS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "read_latest_forecast",
            "description": (
                "Read the most recently computed forecast snapshot (scenario, "
                "ensemble path, per-signal status) for a region. Instant. Prefer "
                "this before running the pipeline; if no snapshot exists it tells "
                "you to run run_forecast_pipeline."
            ),
            "parameters": {
                "type": "object",
                "properties": {"region": _REGION_PARAM},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_forecast_pipeline",
            "description": (
                "Run the full probabilistic forecasting pipeline (FRED data -> "
                "Sybilion forecast jobs -> weighted ensemble -> scenario "
                "classification) for a region and return a summary. SLOW: submits "
                "parallel Sybilion jobs and polls until they settle (minutes). "
                "Only call when the user explicitly wants a fresh run or no recent "
                "snapshot exists."
            ),
            "parameters": {
                "type": "object",
                "properties": {"region": _REGION_PARAM},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_forecast_drivers",
            "description": (
                "Fetch Sybilion 'drivers' (the key explanatory features behind a "
                "forecast) for a single FRED series, e.g. FEDFUNDS or ECBDFR. "
                "Faster than a full pipeline run."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "region": _REGION_PARAM,
                    "series_id": {
                        "type": "string",
                        "description": (
                            "FRED series id (e.g. 'FEDFUNDS', 'DGS2', 'PCEPILFE', "
                            "'UNRATE' for fed; 'ECBDFR' for ecb). Defaults to the "
                            "region's target rate series."
                        ),
                    },
                    "periods": {
                        "type": "integer",
                        "description": "Number of trailing monthly observations to use (default 60).",
                    },
                },
                "required": [],
            },
        },
    },
]

EXECUTORS: dict[str, Callable[..., dict]] = {
    "read_latest_forecast": read_latest_forecast,
    "run_forecast_pipeline": run_forecast_pipeline,
    "get_forecast_drivers": get_forecast_drivers,
}

# Tools whose execution is expected to be slow (UI/status hint).
SLOW_TOOLS = {"run_forecast_pipeline"}


def execute_tool(name: str, arguments: dict | None) -> dict:
    """Dispatch a tool call. Raises :class:`ToolError` for unknown tools."""
    executor = EXECUTORS.get(name)
    if executor is None:
        raise ToolError(f"Unknown tool: {name}")
    return executor(**(arguments or {}))
