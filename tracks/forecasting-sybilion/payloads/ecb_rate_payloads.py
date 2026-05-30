from __future__ import annotations

from payloads.base_payload_builder import BasePayloadBuilder

# ------------------------------------------------------------------
# ECB Signal-Konfiguration
# ------------------------------------------------------------------

ECB_SIGNAL_CONFIGS = [
    {"series_id": "ECBDFR",             "weight": 0.35, "recency_factor": 0.75},
    {"series_id": "IRLTLT01EZM156N",    "weight": 0.30, "recency_factor": 0.85},
    {"series_id": "CP0000EZ19M086NEST", "weight": 0.25, "recency_factor": 0.70},
    {"series_id": "LRHUTTTTEZM156S",    "weight": 0.10, "recency_factor": 0.60},
]

# ------------------------------------------------------------------
# Metadata
# ------------------------------------------------------------------

_FORECAST_METADATA: dict[str, dict] = {
    "ECBDFR": {
        "title": "ECB Deposit Facility Rate Forecast",
        "description": "ECB deposit facility rate, monthly average",
        "keywords": [
            "ECB", "deposit facility rate", "monetary policy",
            "interest rate", "euro area", "rate cut",
        ],
    },
    "IRLTLT01EZM156N": {
        "title": "Euro Area 10-Year Government Bond Yield Forecast",
        "description": "Long-term government bond yields 10-year for Euro Area, monthly average",
        "keywords": [
            "euro area yield", "10-year bond", "rate expectations",
            "ECB pivot", "bond market", "yield curve",
        ],
    },
    "CP0000EZ19M086NEST": {
        "title": "Euro Area CPI Forecast",
        "description": "Euro area harmonised index of consumer prices, YoY % change",
        "keywords": [
            "HICP", "euro area inflation", "CPI", "ECB target",
            "price stability", "disinflation",
        ],
    },
    "LRHUTTTTEZM156S": {
        "title": "Euro Area Unemployment Rate Forecast",
        "description": "Euro area unemployment rate, monthly, seasonally adjusted",
        "keywords": [
            "euro area unemployment", "labor market", "jobless rate",
            "ECB mandate", "labor slack",
        ],
    },
}

_DRIVERS_METADATA: dict[str, dict] = {
    "ECBDFR": {
        "title": "ECB Deposit Facility Rate Monthly",
        "description": "ECB deposit facility rate, monthly average, sourced from FRED.",
        "keywords": ["ECB", "deposit facility rate", "monetary policy", "euro area"],
    },
    "IRLTST01EZM156N": {
        "title": "Euro Area 2-Year Yield Monthly",
        "description": "Euro area 2-year government bond yield, sourced from FRED.",
        "keywords": ["euro area yield", "2-year bond", "rate expectations", "ECB"],
    },
    "CP0000EZ19M086NEST": {
        "title": "Euro Area CPI Monthly",
        "description": "Euro area HICP YoY % change, monthly, sourced from FRED.",
        "keywords": ["HICP", "euro area inflation", "CPI", "ECB target"],
    },
    "LRHUTTTTEZM156S": {
        "title": "Euro Area Unemployment Rate Monthly",
        "description": "Euro area unemployment rate, monthly, sourced from FRED.",
        "keywords": ["euro area unemployment", "labor market", "ECB mandate"],
    },
}

# Euro Area CPI ist ein Index → YoY-Transformation nötig
_YOY_TRANSFORM_SERIES = {"CP0000EZ19M086NEST"}

_FORECAST_FILTERS = {"categories": [3], "regions": [5]}
_DRIVERS_FILTERS  = {"categories": [3, 7], "limit": 20, "regions": [5]}


# ------------------------------------------------------------------
# Builder
# ------------------------------------------------------------------

class ECBRatePayloadBuilder(BasePayloadBuilder):
    """Payload-Builder für ECB-Rate Signale."""

    @property
    def forecast_metadata(self) -> dict[str, dict]:
        return _FORECAST_METADATA

    @property
    def drivers_metadata(self) -> dict[str, dict]:
        return _DRIVERS_METADATA

    @property
    def forecast_filters(self) -> dict:
        return _FORECAST_FILTERS

    @property
    def drivers_filters(self) -> dict:
        return _DRIVERS_FILTERS

    @property
    def yoy_transform_series(self) -> set[str]:
        return _YOY_TRANSFORM_SERIES