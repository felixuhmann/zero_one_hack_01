import os

import pandas as pd
import requests

from forecasting.api.http_utils import parse_json_response


class FREDClient:
    BASE_URL = "https://api.stlouisfed.org/fred"

    def __init__(self):
        self.api_key = os.environ.get("FRED_API_KEY")
        if not self.api_key:
            raise EnvironmentError("Set FRED_API_KEY before fetching FRED data.")

    def fetch_series_observations(
        self,
        series_id: str = "FEDFUNDS",
        periods: int = 61,
        aggregation_method: str = "avg",
    ) -> dict[str, float]:
        """
        Holt monatliche Observations von FRED.
        Gibt dict {YYYY-MM-DD: float} zurück — direkt als Sybilion timeseries verwendbar.
        """
        end = pd.Timestamp.today().normalize().replace(day=1)
        start = end - pd.DateOffset(months=periods)

        params = {
            "series_id": series_id,
            "api_key": self.api_key,
            "file_type": "json",
            "frequency": "m",
            "aggregation_method": aggregation_method,
            "observation_start": start.strftime("%Y-%m-%d"),
            "observation_end": end.strftime("%Y-%m-%d"),
            "sort_order": "asc",
        }

        response = requests.get(
            f"{self.BASE_URL}/series/observations",
            params=params,
            timeout=30,
        )
        data = parse_json_response(response)

        timeseries = {
            obs["date"]: float(obs["value"])
            for obs in data.get("observations", [])
            if obs.get("value") not in (None, ".", "")
        }

        if len(timeseries) < periods:
            raise ValueError(
                f"FRED series {series_id} has only {len(timeseries)} valid points; "
                f"need at least {periods}."
            )

        sorted_dates = sorted(timeseries)
        trimmed_dates = sorted_dates[-periods:]
        return {date: timeseries[date] for date in trimmed_dates}

    def fetch_multiple(
        self,
        series_ids: list[str],
        periods: int = 60,
    ) -> dict[str, dict[str, float]]:
        """
        Holt mehrere Serien auf einmal.
        Gibt dict {series_id: {date: value}} zurück.
        """
        return {
            series_id: self.fetch_series_observations(series_id, periods)
            for series_id in series_ids
        }
