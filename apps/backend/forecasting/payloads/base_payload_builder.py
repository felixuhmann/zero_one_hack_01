from __future__ import annotations

from abc import ABC, abstractmethod

from forecasting.api.fred_api import FREDClient


class BasePayloadBuilder(ABC):
    """
    Abstrakte Basisklasse für alle Zentralbank-Payload-Builder.

    Subklassen definieren ihre eigenen Konstanten als Properties:
    - forecast_metadata     → dict[series_id, {title, description, keywords}]
    - drivers_metadata      → dict[series_id, {title, description, keywords}]
    - forecast_filters      → {"categories": [...], "regions": [...]}
    - drivers_filters       → {"categories": [...], "limit": int, "regions": [...]}
    - yoy_transform_series  → set[series_id] die YoY-Transformation brauchen

    Die gesamte Build-Logik liegt hier — Subklassen fügen nur Daten hinzu.
    """

    def __init__(self, fred_client: FREDClient, pipeline_version: str = "v1"):
        self.fred_client      = fred_client
        self.pipeline_version = pipeline_version

    # ------------------------------------------------------------------
    # Abstract properties — jede Subklasse muss diese definieren
    # ------------------------------------------------------------------

    @property
    @abstractmethod
    def forecast_metadata(self) -> dict[str, dict]:
        """Metadata für Forecast-Payloads pro Series-ID."""
        ...

    @property
    @abstractmethod
    def drivers_metadata(self) -> dict[str, dict]:
        """Metadata für Drivers-Payloads pro Series-ID."""
        ...

    @property
    @abstractmethod
    def forecast_filters(self) -> dict:
        """Sybilion filters/regions für Forecast-Payloads."""
        ...

    @property
    @abstractmethod
    def drivers_filters(self) -> dict:
        """Sybilion filters/regions für Drivers-Payloads."""
        ...

    @property
    @abstractmethod
    def yoy_transform_series(self) -> set[str]:
        """Series-IDs die von Indexwerten in YoY-% umgerechnet werden."""
        ...

    # ------------------------------------------------------------------
    # Public — gleich für alle Subklassen
    # ------------------------------------------------------------------

    def build_forecast_payload(
        self,
        series_id: str,
        periods: int = 60,
        recency_factor: float = 0.75,
    ) -> dict:
        """Baut den Payload für einen Sybilion Forecast-Job."""
        timeseries = self._fetch_and_transform(series_id, periods)
        meta       = self._metadata(series_id, self.forecast_metadata)

        return {
            "backtest":            True,
            "filters":             self.forecast_filters,
            "frequency":           "monthly",
            "hard_horizon":        3,
            "pipeline_version":    self.pipeline_version,
            "recency_factor":      recency_factor,
            "soft_horizon":        6,
            "timeseries":          timeseries,
            "timeseries_metadata": meta,
        }

    def build_drivers_payload(
        self,
        series_id: str,
        periods: int = 60,
    ) -> dict:
        """Baut den Payload für einen Sybilion Drivers-Request."""
        timeseries = self._fetch_and_transform(series_id, periods)
        meta       = self._metadata(series_id, self.drivers_metadata, suffix="Monthly")

        return {
            "filters":             self.drivers_filters,
            "recency_factor":      0.6,
            "timeseries":          timeseries,
            "timeseries_metadata": meta,
            "version":             "v1",
        }

    # ------------------------------------------------------------------
    # Private — Transformation + Metadata-Lookup
    # ------------------------------------------------------------------

    def _fetch_and_transform(self, series_id: str, periods: int) -> dict[str, float]:
        """
        Holt FRED-Daten und wendet YoY-Transformation an falls nötig.
        Für Index-Serien werden 12 Extramonate gefetcht und danach getrimmt.
        """
        fetch_periods = periods + 12 if series_id in self.yoy_transform_series else periods
        raw = self.fred_client.fetch_series_observations(
            series_id=series_id,
            periods=fetch_periods,
        )

        if series_id in self.yoy_transform_series:
            transformed = self._to_yoy_pct_change(raw)
            dates = sorted(transformed.keys())
            return {d: transformed[d] for d in dates[-periods:]}

        return raw

    @staticmethod
    def _to_yoy_pct_change(timeseries: dict[str, float]) -> dict[str, float]:
        """
        Wandelt Indexwerte in YoY-%-Veränderung um.
        Benötigt mindestens 13 Datenpunkte (12 Monate Basis + 1 aktuell).
        """
        dates  = sorted(timeseries.keys())
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
        metadata_dict: dict[str, dict],
        suffix: str = "Forecast",
    ) -> dict:
        """Gibt Metadata für eine Series-ID zurück, mit generischem Fallback."""
        return metadata_dict.get(
            series_id,
            {
                "title":       f"{series_id} {suffix}",
                "description": f"FRED series {series_id}",
                "keywords":    [series_id],
            },
        )