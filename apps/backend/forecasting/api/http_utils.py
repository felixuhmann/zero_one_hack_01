import requests


def parse_json_response(response):
    try:
        body = response.json()
    except requests.JSONDecodeError as exc:
        response.raise_for_status()
        raise RuntimeError(
            f"Expected JSON from {response.url}, got: {response.text[:200]!r}"
        ) from exc

    if not response.ok:
        detail = body
        if isinstance(body, dict):
            detail = body.get("detail") or body.get("error") or body
        raise RuntimeError(
            f"HTTP {response.status_code} from {response.url}: {detail}"
        )

    if isinstance(body, dict) and "error" in body:
        raise RuntimeError(f"API error ({response.status_code}): {body['error']}")
    return body
