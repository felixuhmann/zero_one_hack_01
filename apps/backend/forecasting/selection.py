"""Resolve frontend series selection into pipeline signal configs."""

from __future__ import annotations

from forecasting.catalog.fed_data_sources import (
    SelectionError,
    resolve_fed_signal_configs,
)
from forecasting.regions import RegionConfig


def resolve_signal_configs(
    region: RegionConfig,
    series_ids: list[str] | None,
) -> list[dict]:
    if region.key == "fed":
        return resolve_fed_signal_configs(series_ids)
    if series_ids:
        allowed = {cfg["series_id"] for cfg in region.signal_configs}
        ids = [s.strip().upper() for s in series_ids if s and str(s).strip()]
        unknown = [sid for sid in ids if sid not in allowed]
        if unknown:
            raise SelectionError(f"Unknown series for {region.key}: {', '.join(unknown)}")
        by_id = {cfg["series_id"]: cfg for cfg in region.signal_configs}
        return [by_id[sid] for sid in ids if sid in by_id]
    return list(region.signal_configs)
