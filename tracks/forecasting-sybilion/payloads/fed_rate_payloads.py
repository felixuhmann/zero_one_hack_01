from __future__ import annotations

from api.fred_api import FREDClient

# ------------------------------------------------------------------
# Metadata für Sybilion timeseries_metadata
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
}

_DRIVERS_METADATA: dict[str, dict] = {
    "FEDFUNDS": {
        "title": "Federal Funds Rate Monthly",
        "description": "Effective federal funds rate, monthly average, sourced from FRED.",
        "keywords": [
            "federal funds rate", "FOMC", "monetary policy", "interest rate",
        ],
    },
    "DGS2": {
        "title": "2-Year Treasury Yield Monthly",
        "description": "2-Year US Treasury constant maturity rate, monthly average, sourced from FRED.",
        "keywords": [
            "2-year treasury", "yield curve", "rate expectations", "bond market",
        ],
    },
    "PCEPILFE": {
        "title": "Core PCE Inflation Monthly",
        "description": "Core PCE Price Index YoY % change, monthly, sourced from FRED.",
        "keywords": [
            "core PCE", "inflation", "Fed target", "price stability",
        ],
    },
    "UNRATE": {
        "title": "Unemployment Rate Monthly",
        "description": "US civilian unemployment rate, monthly, sourced from FRED.",
        "keywords": [
            "unemployment", "labor market", "jobless rate", "Fed dual mandate",
        ],
    },
    "T10Y2Y": {
        "title": "Yield Curve Spread Monthly",
        "description": "10-Year minus 2-Year Treasury spread, monthly, sourced from FRED.",
        "keywords": [
            "yield curve", "inversion", "recession signal", "term premium",
        ],
    },
    "PAYEMS": {
        "title": "Nonfarm Payrolls Monthly",
        "description": "Total nonfarm payrolls monthly change, sourced from FRED.",
        "keywords": [
            "nonfarm payrolls", "job growth", "employment", "labor market",
        ],
    },
    "CES0500000003": {
        "title": "Average Hourly Earnings Monthly",
        "description": "Average hourly earnings of all private employees, sourced from FRED.",
        "keywords": [
            "wage growth", "hourly earnings", "wage inflation", "labor costs",
        ],
    },
}

# Serien die als YoY-%-Veränderung transformiert werden müssen
# (FRED liefert Indexwerte, Sybilion erwartet interpretierbare Größen)
_YOY_TRANSFORM_SERIES = {"PCEPILFE", "PAYEMS", "CES0500000003"}

# Sybilion filter/regions pro Serie
# (alle US-Serien teilen denselben Filter, erweiterbar für EU/JP)
_DEFAULT_FORECAST_FILTERS = {"categories": [3], "regions": [42]}
_DEFAULT_DRIVERS_FILTERS  = {"categories": [3, 7], "limit": 20, "regions": [42]}


class FedRatePayloadBuilder:
    """
    Baut Sybilion-Payloads für US-Makro-Signale.

    Zuständigkeiten:
    - FRED-Daten holen via FREDClient
    - YoY-Transformation für Index-Serien
    - Metadata (title, description, keywords) pro Serie
    - Forecast- und Drivers-Payload zusammenbauen
    """

    def __init__(self, fred_client: FREDClient, pipeline_version: str = "v1"):
        self.fred_client      = fred_client
        self.pipeline_version = pipeline_version

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def build_forecast_payload(
        self,
        series_id: str = "FEDFUNDS",
        periods: int = 60,
        recency_factor: float = 0.75,
    ) -> dict:
        """
        Baut den Payload für einen Sybilion Forecast-Job.
        Transformiert Index-Serien automatisch in YoY-%-Veränderung.
        """
        timeseries = self._fetch_and_transform(series_id, periods)
        meta       = self._metadata(series_id, _FORECAST_METADATA)

        return {
            "backtest":           True,
            "filters":            _DEFAULT_FORECAST_FILTERS,
            "frequency":          "monthly",
            "hard_horizon":       3,
            "pipeline_version":   self.pipeline_version,
            "recency_factor":     recency_factor,
            "soft_horizon":       6,
            "timeseries":         timeseries,
            "timeseries_metadata": meta,
        }

    def build_drivers_payload(
        self,
        series_id: str = "FEDFUNDS",
        periods: int = 60,
    ) -> dict:
        """
        Baut den Payload für einen Sybilion Drivers-Request.
        """
        timeseries = self._fetch_and_transform(series_id, periods)
        meta       = self._metadata(series_id, _DRIVERS_METADATA, suffix="Monthly")

        return {
            "filters":            _DEFAULT_DRIVERS_FILTERS,
            "recency_factor":     0.6,
            "timeseries":         timeseries,
            "timeseries_metadata": meta,
            "version":            "v1",
        }

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    def _fetch_and_transform(self, series_id: str, periods: int) -> dict[str, float]:
        """
        Holt FRED-Daten und wendet YoY-Transformation an falls nötig.
        Index-Serien (PCEPILFE, PAYEMS, CES0500000003) werden in
        YoY-%-Veränderung umgerechnet — Sybilion erwartet interpretierbare Größen,
        keine Rohdaten-Indexwerte.
        """
        # Für YoY brauchen wir 12 extra Monate als Basis
        fetch_periods = periods + 12 if series_id in _YOY_TRANSFORM_SERIES else periods
        raw = self.fred_client.fetch_series_observations(
            series_id=series_id,
            periods=fetch_periods,
        )

        if series_id in _YOY_TRANSFORM_SERIES:
            transformed = self._to_yoy_pct_change(raw)
            # Nach Transformation auf gewünschte Periode trimmen
            dates = sorted(transformed.keys())
            return {d: transformed[d] for d in dates[-periods:]}

        return raw

    @staticmethod
    def _to_yoy_pct_change(timeseries: dict[str, float]) -> dict[str, float]:
        """
        Wandelt Indexwerte in YoY-%-Veränderung um.
        Benötigt mindestens 13 Datenpunkte (12 Monate Basis + 1 aktuell).
        """
        dates = sorted(timeseries.keys())
        result = {}

        for i, date in enumerate(dates):
            if i < 12:
                continue
            prev_date = dates[i - 12]
            current   = timeseries[date]
            previous  = timeseries[prev_date]
            if previous != 0:
                result[date] = round((current - previous) / previous * 100, 4)

        return result

    @staticmethod
    def _metadata(
        series_id: str,
        metadata_dict: dict,
        suffix: str = "Forecast",
    ) -> dict:
        return metadata_dict.get(
            series_id,
            {
                "title":       f"{series_id} {suffix}",
                "description": f"FRED series {series_id}",
                "keywords":    [series_id],
            },
        )