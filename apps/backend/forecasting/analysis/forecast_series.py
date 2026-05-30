from __future__ import annotations


def _forecast_value(point: object) -> float | None:
    if isinstance(point, bool):
        return None
    if isinstance(point, (int, float)):
        return float(point)
    if isinstance(point, dict):
        for key in ("forecast", "value", "y", "prediction", "mean"):
            if key not in point or point[key] is None:
                continue
            try:
                return float(point[key])
            except (TypeError, ValueError):
                continue
    return None


def normalize_forecast_series(raw: object) -> dict[str, float]:
    if raw is None:
        return {}

    result: dict[str, float] = {}

    if isinstance(raw, dict):
        for date, point in raw.items():
            value = _forecast_value(point)
            if value is not None:
                result[str(date)] = value
        return result

    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            date = item.get("date") or item.get("timestamp") or item.get("time")
            value = _forecast_value(item)
            if date is not None and value is not None:
                result[str(date)] = value
        return result

    return result


def extract_forecast_series_from_payload(forecast: dict | None) -> dict[str, float]:
    if not forecast or not isinstance(forecast, dict):
        return {}

    candidates: list[object] = []
    data = forecast.get("data")
    if isinstance(data, dict):
        candidates.append(data.get("forecast_series"))
    candidates.append(forecast.get("forecast_series"))

    for raw in candidates:
        series = normalize_forecast_series(raw)
        if series:
            return series

    return {}


def extract_forecast_series_from_signal(signal: dict | None) -> dict[str, float]:
    if not signal or not isinstance(signal, dict):
        return {}
    return extract_forecast_series_from_payload(signal.get("forecast"))


def pick_forecast_payload(artifacts: dict) -> dict | None:
    if not artifacts:
        return None

    preferred = artifacts.get("forecast.json")
    if isinstance(preferred, dict):
        return preferred

    for name in sorted(artifacts.keys()):
        if not name.endswith(".json"):
            continue
        content = artifacts[name]
        if isinstance(content, dict) and extract_forecast_series_from_payload(content):
            return content

    return None
