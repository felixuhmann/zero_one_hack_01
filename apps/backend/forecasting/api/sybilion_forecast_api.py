import os

from forecasting.api.http_utils import parse_json_response, request_with_retry
from forecasting.env import _strip_env

_MAX_RETRIES = int(os.environ.get("SYBILION_MAX_RETRIES", "5"))
# (connect, read) — status polls can be slow when the upstream API is busy.
_STATUS_TIMEOUT = (10, 90)
_DEFAULT_TIMEOUT = 60


def sybilion_token():
    token = _strip_env(os.environ.get("SYBILION_API_KEY")) or _strip_env(
        os.environ.get("SYBILION_API_TOKEN")
    )
    if not token:
        raise EnvironmentError(
            "Set SYBILION_API_KEY in .env at the repo root (see .env.example)."
        )
    return token


def sybilion_headers():
    return {
        "Authorization": f"Bearer {sybilion_token()}",
        "Content-Type": "application/json",
    }


class SybilionForecastApiClient:
    BASE_URL = "https://api.sybilion.dev/api/v1"

    def submit_forecast(self, payload):
        response = request_with_retry(
            "POST",
            f"{self.BASE_URL}/forecasts",
            headers=sybilion_headers(),
            json=payload,
            timeout=_DEFAULT_TIMEOUT,
            max_retries=_MAX_RETRIES,
        )
        body = parse_json_response(response)
        return body["job_id"]

    def get_forecast_status(self, job_id):
        response = request_with_retry(
            "GET",
            f"{self.BASE_URL}/forecasts/{job_id}",
            headers=sybilion_headers(),
            timeout=_STATUS_TIMEOUT,
            max_retries=_MAX_RETRIES,
        )
        return parse_json_response(response)

    def download_artifact(self, job_id, name):
        headers = {"Authorization": sybilion_headers()["Authorization"]}
        response = request_with_retry(
            "GET",
            f"{self.BASE_URL}/forecasts/{job_id}/artifacts/{name}",
            headers=headers,
            timeout=_DEFAULT_TIMEOUT,
            max_retries=_MAX_RETRIES,
        )
        response.raise_for_status()
        return response

    def get_drivers(self, payload):
        response = request_with_retry(
            "POST",
            f"{self.BASE_URL}/drivers",
            headers=sybilion_headers(),
            json=payload,
            timeout=_DEFAULT_TIMEOUT,
            max_retries=_MAX_RETRIES,
        )
        return parse_json_response(response)
