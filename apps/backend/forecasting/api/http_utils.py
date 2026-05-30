import json
import requests


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
