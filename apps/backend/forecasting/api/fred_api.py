import logging
import os
import threading
import time

import pandas as pd
import requests

from forecasting.api.http_utils import parse_json_response
from forecasting.env import SYBILION_MIN_OBSERVATIONS, _strip_env

logger = logging.getLogger(__name__)

# FRED allows ~120 requests/min for standard keys; parallel signal jobs used to burst past this.
_DEFAULT_MIN_INTERVAL_S = float(os.environ.get("FRED_REQUEST_INTERVAL_S", "0.65"))
_MAX_RETRIES = int(os.environ.get("FRED_MAX_RETRIES", "5"))


class FREDClient:
    BASE_URL = "https://api.stlouisfed.org/fred"

    _request_lock = threading.Lock()
    _last_request_at = 0.0

    def __init__(self, min_interval_s: float | None = None):
        self.api_key = _strip_env(os.environ.get("FRED_API_KEY"))
        if not self.api_key:
            raise EnvironmentError(
                "Set FRED_API_KEY in .env at the repo root (see .env.example)."
            )
        self._min_interval_s = (
            min_interval_s if min_interval_s is not None else _DEFAULT_MIN_INTERVAL_S
        )

    def _throttle(self) -> None:
        with FREDClient._request_lock:
            elapsed = time.monotonic() - FREDClient._last_request_at
            if elapsed < self._min_interval_s:
                time.sleep(self._min_interval_s - elapsed)
            FREDClient._last_request_at = time.monotonic()

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
        # Extra history so trimming to `periods` still yields 60 after missing FRED values.
        window_months = periods + 6
        start = end - pd.DateOffset(months=window_months)

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
        url = f"{self.BASE_URL}/series/observations"

        last_error: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            self._throttle()
            try:
                response = requests.get(url, params=params, timeout=30)
            except requests.RequestException as exc:
                last_error = exc
                time.sleep(min(2**attempt, 30))
                continue

            if response.status_code == 429:
                wait = min(2 ** (attempt + 1), 60)
                logger.warning(
                    "FRED rate limit for %s (attempt %s/%s), sleeping %.0fs",
                    series_id,
                    attempt + 1,
                    _MAX_RETRIES,
                    wait,
                )
                time.sleep(wait)
                last_error = RuntimeError(
                    f"HTTP 429 from FRED for {series_id}: rate limit exceeded"
                )
                continue

            data = parse_json_response(response)
            return self._parse_observations(data, series_id, periods)

        raise RuntimeError(
            f"FRED fetch failed for {series_id} after {_MAX_RETRIES} attempts"
        ) from last_error

    @staticmethod
    def ensure_contiguous_monthly(
        timeseries: dict[str, float], series_id: str
    ) -> dict[str, float]:
        """Sybilion requires a gap-free monthly index; FRED can omit unrevised months."""
        if not timeseries:
            return timeseries

        series = pd.Series(timeseries, dtype=float)
        series.index = pd.to_datetime(series.index)
        series = series.sort_index()
        full_index = pd.date_range(series.index.min(), series.index.max(), freq="MS")
        missing = full_index.difference(series.index)
        if len(missing):
            logger.info(
                "FRED %s: forward-filling %s missing month(s): %s",
                series_id,
                len(missing),
                ", ".join(d.strftime("%Y-%m-%d") for d in missing[:6]),
            )
        filled = series.reindex(full_index).ffill()
        if filled.isna().any():
            filled = filled.bfill()
        return {d.strftime("%Y-%m-%d"): float(v) for d, v in filled.items()}

    @staticmethod
    def _parse_observations(
        data: dict, series_id: str, periods: int
    ) -> dict[str, float]:
        timeseries = {
            obs["date"]: float(obs["value"])
            for obs in data.get("observations", [])
            if obs.get("value") not in (None, ".", "")
        }

        timeseries = FREDClient.ensure_contiguous_monthly(timeseries, series_id)
        sorted_dates = sorted(timeseries)
        trimmed_dates = sorted_dates[-periods:]
        result = {date: timeseries[date] for date in trimmed_dates}

        if len(result) < max(12,SYBILION_MIN_OBSERVATIONS-2):
            raise ValueError(
                f"FRED series {series_id} has only {len(result)} valid points after trim; "
                f"need at least {SYBILION_MIN_OBSERVATIONS} (Sybilion minimum)."
            )

        return result
