import requests
import os
from api.http_utils import parse_json_response

def sybilion_token():
    token = os.environ.get("SYBILION_API_KEY") 
    if not token:
        raise EnvironmentError(
            "Set SYBILION_API_KEY or SYBILION_API_TOKEN before calling the Sybilion API."
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
        response = requests.post(
            f"{self.BASE_URL}/forecasts",
            headers=sybilion_headers(),
            json=payload,
            timeout=30,
        )
        body = parse_json_response(response)
        return body["job_id"]

    def get_forecast_status(self, job_id):
        response = requests.get(
            f"{self.BASE_URL}/forecasts/{job_id}",
            headers=sybilion_headers(),
            timeout=30,
        )
        return parse_json_response(response)

    def download_artifact(self, job_id, name):
        headers = {"Authorization": sybilion_headers()["Authorization"]}
        response = requests.get(
            f"{self.BASE_URL}/forecasts/{job_id}/artifacts/{name}",
            headers=headers,
            timeout=60,
        )
        response.raise_for_status()
        return response

    def get_drivers(self, payload):
        response = requests.post(
            f"{self.BASE_URL}/drivers",
            headers=sybilion_headers(),
            json=payload,
            timeout=60,
        )
        return parse_json_response(response)
