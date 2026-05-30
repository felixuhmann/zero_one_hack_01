import json
import logging
import time

import requests

logger = logging.getLogger(__name__)

_TRANSIENT_STATUS_CODES = frozenset({429, 502, 503, 504})


def request_with_retry(
    method: str,
    url: str,
    *,
    max_retries: int = 5,
    **kwargs,
) -> requests.Response:
    """Issue an HTTP request, retrying transient network and server errors."""
    last_error: Exception | None = None
    for attempt in range(max_retries):
        try:
            response = requests.request(method, url, **kwargs)
        except requests.RequestException as exc:
            last_error = exc
            wait = min(2**attempt, 30)
            logger.warning(
                "%s %s failed (attempt %s/%s): %s; retrying in %.0fs",
                method,
                url,
                attempt + 1,
                max_retries,
                exc,
                wait,
            )
            time.sleep(wait)
            continue

        if response.status_code in _TRANSIENT_STATUS_CODES:
            wait = min(2 ** (attempt + 1), 60)
            logger.warning(
                "HTTP %s from %s (attempt %s/%s); retrying in %.0fs",
                response.status_code,
                url,
                attempt + 1,
                max_retries,
                wait,
            )
            time.sleep(wait)
            last_error = RuntimeError(
                f"HTTP {response.status_code} from {url}"
            )
            continue

        return response

    if isinstance(last_error, requests.RequestException):
        raise last_error
    raise RuntimeError(
        f"{method} {url} failed after {max_retries} attempts"
    ) from last_error


def _format_error_body(body) -> str:
    if not isinstance(body, dict):
        return str(body)
    parts: list[str] = []
    for key in (
        "detail",
        "error",
        "message",
        "title",
        "type",
        "issues",
        "field_errors",
    ):
        if key in body and body[key] is not None:
            val = body[key]
            if isinstance(val, (dict, list)):
                val = json.dumps(val, default=str)[:800]
            parts.append(f"{key}={val!r}")
    if "errors" in body:
        parts.append(f"errors={json.dumps(body['errors'], default=str)[:800]}")
    if "validation_errors" in body:
        parts.append(
            f"validation_errors={json.dumps(body['validation_errors'], default=str)[:800]}"
        )
    if not parts:
        return json.dumps(body, default=str)[:1200]
    return "; ".join(parts)


def parse_json_response(response):
    try:
        body = response.json()
    except requests.JSONDecodeError as exc:
        response.raise_for_status()
        raise RuntimeError(
            f"Expected JSON from {response.url}, got: {response.text[:200]!r}"
        ) from exc

    if not response.ok:
        detail = _format_error_body(body) if isinstance(body, dict) else body
        raise RuntimeError(
            f"HTTP {response.status_code} from {response.url}: {detail}"
        )

    if isinstance(body, dict) and "error" in body:
        raise RuntimeError(f"API error ({response.status_code}): {body['error']}")
    return body
