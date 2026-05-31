"""Canonical registry of forecastable central-bank regions.

Single source of truth for "which central bank maps to which payload builder,
signal configs, artifacts directory, and label". The CLI, the REST endpoint
(:mod:`forecasting.cli`) and the chat tools (:mod:`forecasting.chat.tools`) all
resolve regions through here instead of wiring pipelines up by hand.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from forecasting.analysis.ensemble_engine import EnsembleEngine
from forecasting.analysis.scenario_classifier import ScenarioClassifier
from forecasting.api.fred_api import FREDClient
from forecasting.api.sybilion_forecast_api import SybilionForecastApiClient
from forecasting.payloads.base_payload_builder import BasePayloadBuilder
from forecasting.payloads.ecb_rate_payloads import (
    ECB_SIGNAL_CONFIGS,
    ECBRatePayloadBuilder,
)
from forecasting.payloads.fed_rate_payloads import (
    US_SIGNAL_CONFIGS,
    FedRatePayloadBuilder,
)
from forecasting.pipeline import RateForecastPipeline


# Backend package root (`.../apps/backend`, the parent of the `forecasting`
# package). Anchoring artifacts here keeps the read/write location independent
# of the process CWD — locally the server is launched from `apps/backend`, but
# the container runs with WORKDIR=/app, so a *relative* path would resolve to
# `/app/artifacts` (empty) instead of the image's baked-in `/app/apps/backend/
# artifacts`, making the deployed API 404 on cached results.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]

# Absolute base for persisted artifacts. Override with FORECAST_ARTIFACTS_DIR to
# point at a mounted volume for cross-restart persistence.
_ARTIFACTS_BASE = Path(
    os.environ.get("FORECAST_ARTIFACTS_DIR") or (_BACKEND_ROOT / "artifacts")
).resolve()


def _artifacts_dir(*parts: str) -> str:
    """Absolute path under the artifacts base, joined from ``parts``."""
    return str(_ARTIFACTS_BASE.joinpath(*parts))


class RegionError(ValueError):
    """Raised when a region cannot be resolved."""


@dataclass(frozen=True)
class RegionConfig:
    """Everything needed to run and store a forecast for one region."""

    key: str
    label: str
    builder_cls: type[BasePayloadBuilder]
    signal_configs: list[dict]
    artifacts_dir: str


REGIONS: dict[str, RegionConfig] = {
    "fed": RegionConfig(
        key="fed",
        label="US Federal Reserve (Fed)",
        builder_cls=FedRatePayloadBuilder,
        signal_configs=US_SIGNAL_CONFIGS,
        artifacts_dir=_artifacts_dir("fed_rate_forecast"),
    ),
    "ecb": RegionConfig(
        key="ecb",
        label="European Central Bank (ECB)",
        builder_cls=ECBRatePayloadBuilder,
        signal_configs=ECB_SIGNAL_CONFIGS,
        artifacts_dir=_artifacts_dir("ecb"),
    ),
}

# Free-text aliases the model/users tend to use, mapped to canonical keys.
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


def resolve_region(region: str | None) -> RegionConfig:
    """Resolve a (possibly aliased) region string to its :class:`RegionConfig`."""
    key = (region or "fed").strip().lower()
    key = _REGION_ALIASES.get(key, key)
    config = REGIONS.get(key)
    if config is None:
        raise RegionError(f"Unknown region {region!r}. Use 'fed' or 'ecb'.")
    return config


def build_pipeline(region: RegionConfig) -> RateForecastPipeline:
    """Assemble a pipeline with shared dependencies for a region."""
    fred = FREDClient()
    return RateForecastPipeline(
        fred_client=fred,
        forecast_client=SybilionForecastApiClient(),
        payload_builder=region.builder_cls(fred),
        ensemble_engine=EnsembleEngine(),
        scenario_classifier=ScenarioClassifier(),
        artifacts_base_dir=region.artifacts_dir,
    )
