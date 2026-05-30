"""Fed data-source catalog — aligned with ``apps/frontend/src/studio/data.ts``."""

from __future__ import annotations

from forecasting.analysis.scenario_classifier import SignalRole

# Mirrors PROPOSED_SOURCES in the Decision Studio (seriesId, role, weight, recommended).
FED_DATA_SOURCES: list[dict] = [
    {
        "series_id": "FEDFUNDS",
        "title": "Effective Federal Funds Rate",
        "role": "target",
        "source": "FRED",
        "cadence": "Monthly",
        "points": 312,
        "min_required": 120,
        "weight": 0.30,
        "recency_factor": 0.75,
        "recommended": True,
        "keywords": ["federal funds rate", "FOMC", "monetary policy", "Fed pivot"],
    },
    {
        "series_id": "PCEPILFE",
        "title": "Core PCE Inflation (YoY)",
        "role": "inflation",
        "source": "FRED",
        "cadence": "Monthly",
        "points": 312,
        "min_required": 120,
        "weight": 0.25,
        "recency_factor": 0.70,
        "recommended": True,
        "keywords": ["core PCE", "inflation", "Fed target", "disinflation"],
    },
    {
        "series_id": "DGS2",
        "title": "2-Year Treasury Yield",
        "role": "leading",
        "source": "FRED",
        "cadence": "Monthly",
        "points": 312,
        "min_required": 120,
        "weight": 0.25,
        "recency_factor": 0.85,
        "recommended": True,
        "keywords": ["2-year treasury", "rate expectations", "yield curve"],
    },
    {
        "series_id": "UNRATE",
        "title": "Unemployment Rate",
        "role": "labor",
        "source": "FRED",
        "cadence": "Monthly",
        "points": 312,
        "min_required": 120,
        "weight": 0.20,
        "recency_factor": 0.60,
        "recommended": True,
        "keywords": ["unemployment", "labor market", "dual mandate", "labor slack"],
    },
    {
        "series_id": "CES0500000003",
        "title": "Average Hourly Earnings (YoY)",
        "role": "context",
        "source": "FRED",
        "cadence": "Monthly",
        "points": 228,
        "min_required": 120,
        "weight": 0.12,
        "recency_factor": 0.70,
        "recommended": False,
        "keywords": ["wage growth", "labor costs", "sticky inflation"],
    },
    {
        "series_id": "NFCI",
        "title": "Chicago Fed Financial Conditions",
        "role": "context",
        "source": "FRED",
        "cadence": "Weekly → Monthly",
        "points": 204,
        "min_required": 120,
        "weight": 0.10,
        "recency_factor": 0.75,
        "recommended": False,
        "keywords": ["financial conditions", "credit spreads", "transmission"],
    },
    {
        "series_id": "PAYEMS",
        "title": "Nonfarm Payrolls (Δ, 000s)",
        "role": "labor",
        "source": "FRED",
        "cadence": "Monthly",
        "points": 312,
        "min_required": 120,
        "weight": 0.10,
        "recency_factor": 0.60,
        "recommended": False,
        "keywords": ["nonfarm payrolls", "job growth", "jobs report"],
    },
]

_ROLE_MAP: dict[str, str] = {
    "target": SignalRole.TARGET,
    "leading": SignalRole.LEADING,
    "inflation": SignalRole.INFLATION,
    "labor": SignalRole.LABOR,
    "context": SignalRole.CONTEXT,
}

_CATALOG_BY_ID = {row["series_id"]: row for row in FED_DATA_SOURCES}


class SelectionError(ValueError):
    """Invalid series selection from the client."""


def default_included_series_ids() -> list[str]:
    return [row["series_id"] for row in FED_DATA_SOURCES if row.get("recommended")]


def resolve_fed_signal_configs(series_ids: list[str] | None) -> list[dict]:
    """Build pipeline signal configs for the series the user selected in the UI."""
    if series_ids is None:
        ids = default_included_series_ids()
    else:
        ids = [s.strip().upper() for s in series_ids if s and str(s).strip()]

    if len(ids) < 2:
        raise SelectionError("Select at least two series (frontend requires ≥ 2 inputs).")

    if "FEDFUNDS" not in ids:
        raise SelectionError(
            "Include the policy target series (FEDFUNDS) so the ensemble anchors to the funds rate."
        )

    unknown = [sid for sid in ids if sid not in _CATALOG_BY_ID]
    if unknown:
        raise SelectionError(
            f"Unknown series: {', '.join(unknown)}. "
            f"Allowed: {', '.join(_CATALOG_BY_ID)}"
        )

    rows = [_CATALOG_BY_ID[sid] for sid in ids]
    total_weight = sum(row["weight"] for row in rows) or 1.0

    return [
        {
            "series_id": row["series_id"],
            "weight": round(row["weight"] / total_weight, 6),
            "recency_factor": row["recency_factor"],
            "role": _ROLE_MAP[row["role"]],
        }
        for row in rows
    ]


def sources_for_response(
    series_ids: list[str],
    signal_configs: list[dict],
) -> list[dict]:
    """Data-source rows for the aggregate JSON (matches frontend DataSource shape)."""
    weight_by_id = {cfg["series_id"]: cfg["weight"] for cfg in signal_configs}
    out: list[dict] = []
    for sid in series_ids:
        row = _CATALOG_BY_ID.get(sid)
        if not row:
            continue
        w = weight_by_id.get(sid)
        out.append(
            {
                "seriesId": sid,
                "title": row["title"],
                "role": row["role"],
                "source": row["source"],
                "cadence": row["cadence"],
                "points": row["points"],
                "minRequired": row["min_required"],
                "weight": row["weight"],
                "normalizedWeight": w,
                "rationale": row.get("rationale", ""),
                "keywords": row["keywords"],
                "recommended": row["recommended"],
                "included": True,
            }
        )
    return out
