from __future__ import annotations

from forecasting.analysis.scenario_classifier import SignalRole
from forecasting.payloads.base_payload_builder import BasePayloadBuilder

# ------------------------------------------------------------------
# US Signal-Konfiguration für FedForecastOrchestrator
# ------------------------------------------------------------------

US_SIGNAL_CONFIGS = [
    {"series_id": "FEDFUNDS", "weight": 0.30, "recency_factor": 0.75, "role": SignalRole.TARGET},
    {"series_id": "DGS2",     "weight": 0.25, "recency_factor": 0.85, "role": SignalRole.LEADING},
    {"series_id": "PCEPILFE", "weight": 0.25, "recency_factor": 0.70, "role": SignalRole.INFLATION},
    {"series_id": "UNRATE",   "weight": 0.20, "recency_factor": 0.60, "role": SignalRole.LABOR},
    {"series_id": "NAPM",     "weight": 0.10, "recency_factor": 0.80, "role": SignalRole.CONTEXT},
]

# ------------------------------------------------------------------
# Metadata
# ------------------------------------------------------------------

_FORECAST_METADATA: dict[str, dict] = {
    "FEDFUNDS": {
        "title": "Federal Funds Rate Forecast",
        "description": "Effective federal funds rate, monthly average",
        "keywords": [
            "federal funds rate", "FOMC", "monetary policy",
            "interest rate", "Fed pivot", "rate hike",
        ],
    },
    "DGS2": {
        "title": "2-Year Treasury Yield Forecast",
        "description": "2-Year US Treasury constant maturity rate, monthly average",
        "keywords": [
            "2-year treasury", "yield curve", "rate expectations",
            "monetary policy", "Fed pivot", "bond market",
        ],
    },
    "PCEPILFE": {
        "title": "Core PCE Inflation Forecast",
        "description": "Core Personal Consumption Expenditures Price Index, YoY % change",
        "keywords": [
            "core PCE", "inflation", "personal consumption",
            "Fed target", "price stability", "disinflation",
        ],
    },
    "UNRATE": {
        "title": "Unemployment Rate Forecast",
        "description": "US civilian unemployment rate, monthly",
        "keywords": [
            "unemployment", "labor market", "jobless rate",
            "Fed dual mandate", "nonfarm payrolls", "labor slack",
        ],
    },
    "T10Y2Y": {
        "title": "Yield Curve Spread Forecast",
        "description": "10-Year minus 2-Year Treasury yield spread",
        "keywords": [
            "yield curve", "inversion", "recession signal",
            "10-2 spread", "term premium", "rate expectations",
        ],
    },
    "PAYEMS": {
        "title": "Nonfarm Payrolls Forecast",
        "description": "Total nonfarm payrolls, monthly change in thousands",
        "keywords": [
            "nonfarm payrolls", "job growth", "labor market",
            "employment", "Fed dual mandate", "jobs report",
        ],
    },
    "CES0500000003": {
        "title": "Average Hourly Earnings Forecast",
        "description": "Average hourly earnings of all private employees, monthly",
        "keywords": [
            "wage growth", "hourly earnings", "labor costs",
            "wage inflation", "sticky inflation", "compensation",
        ],
    },
    "NAPM": {
        "title": "NAPM / ISM Manufacturing Activity Forecast",
        "description": "FRED manufacturing activity series NAPM, using the legacy NAPM series until 2000 and the ISM manufacturing PMI series thereafter.",
        "keywords": [
            "NAPM", "ISM", "manufacturing PMI", "economic activity",
            "business survey", "leading indicator",
        ],
    },
}

_DRIVERS_METADATA: dict[str, dict] = {
    "FEDFUNDS": {
        "title": "Federal Funds Rate Monthly",
        "description": "Effective federal funds rate, monthly average, sourced from FRED.",
        "keywords": ["federal funds rate", "FOMC", "monetary policy", "interest rate"],
    },
    "DGS2": {
        "title": "2-Year Treasury Yield Monthly",
        "description": "2-Year US Treasury constant maturity rate, monthly average, sourced from FRED.",
        "keywords": ["2-year treasury", "yield curve", "rate expectations", "bond market"],
    },
    "PCEPILFE": {
        "title": "Core PCE Inflation Monthly",
        "description": "Core PCE Price Index YoY % change, monthly, sourced from FRED.",
        "keywords": ["core PCE", "inflation", "Fed target", "price stability"],
    },
    "UNRATE": {
        "title": "Unemployment Rate Monthly",
        "description": "US civilian unemployment rate, monthly, sourced from FRED.",
        "keywords": ["unemployment", "labor market", "jobless rate", "Fed dual mandate"],
    },
    "T10Y2Y": {
        "title": "Yield Curve Spread Monthly",
        "description": "10-Year minus 2-Year Treasury spread, monthly, sourced from FRED.",
        "keywords": ["yield curve", "inversion", "recession signal", "term premium"],
    },
    "PAYEMS": {
        "title": "Nonfarm Payrolls Monthly",
        "description": "Total nonfarm payrolls monthly change, sourced from FRED.",
        "keywords": ["nonfarm payrolls", "job growth", "employment", "labor market"],
    },
    "CES0500000003": {
        "title": "Average Hourly Earnings Monthly",
        "description": "Average hourly earnings of all private employees, sourced from FRED.",
        "keywords": ["wage growth", "hourly earnings", "wage inflation", "labor costs"],
    },
}

# Serien die als YoY-%-Veränderung transformiert werden müssen
_YOY_TRANSFORM_SERIES = {"PCEPILFE", "PAYEMS", "CES0500000003"}

_FORECAST_FILTERS = {"categories": [3], "regions": [42]}
_DRIVERS_FILTERS  = {"categories": [3, 7], "limit": 20, "regions": [42]}


# ------------------------------------------------------------------
# Builder
# ------------------------------------------------------------------

class FedRatePayloadBuilder(BasePayloadBuilder):
    """Payload-Builder für US Fed-Rate Signale."""

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