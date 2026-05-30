from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware

from forecasting.env import load_env

load_env()

from forecasting.chat import ChatService
from forecasting.chat import ui_stream
from forecasting.analysis.ensemble_engine import EnsembleEngine
from forecasting.analysis.forecast_series import extract_forecast_series_from_signal
from forecasting.analysis.scenario_classifier import ScenarioClassifier
from forecasting.api.fred_api import FREDClient
from forecasting.api.sybilion_forecast_api import SybilionForecastApiClient
from forecasting.fed_rate_pipeline import FedRatePipeline
from forecasting.payloads.ecb_rate_payloads import ECBRatePayloadBuilder, ECB_SIGNAL_CONFIGS
from forecasting.payloads.fed_rate_payloads import FedRatePayloadBuilder, US_SIGNAL_CONFIGS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
_api_logger = logging.getLogger("forecasting.api")


class RequestLogMiddleware(BaseHTTPMiddleware):
    """Log API latency; chat streams may take many minutes to finish."""

    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        _api_logger.info(
            "%s %s -> %s (%.0f ms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response


app = FastAPI(
    title="Fed Rate Forecast API",
    description="Runs the FRED → Sybilion → ensemble → scenario pipeline.",
    version="0.1.0",
)

app.add_middleware(RequestLogMiddleware)

# Allowed CORS origins. The bundled frontend is served from the same origin in
# production (so it needs no CORS), but the Vite dev server (5173) and any extra
# origins listed in CORS_ALLOW_ORIGINS (comma-separated) are permitted too.
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_extra_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOW_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEFAULT_CORS_ORIGINS + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_pipeline(
    fred: FREDClient,
    payload_builder,
    artifacts_dir: str,
) -> FedRatePipeline:
    """Baut eine Pipeline-Instanz mit geteilten Abhängigkeiten."""
    return FedRatePipeline(
        fred_client=fred,
        forecast_client=SybilionForecastApiClient(),
        payload_builder=payload_builder,
        ensemble_engine=EnsembleEngine(),
        scenario_classifier=ScenarioClassifier(),
        artifacts_base_dir=artifacts_dir,
    )


def serialize_pipeline_result(result: dict) -> dict:
    """JSON-safe view of pipeline.run() for the frontend."""
    signals_out: dict = {}
    for series_id, item in result.get("signals", {}).items():
        if item is None:
            signals_out[series_id] = None
            continue
        signals_out[series_id] = {
            "series_id": item["series_id"],
            "weight": item["weight"],
            "job": item["job"],
            "forecast": item.get("forecast"),
        }

    return {
        "signals": signals_out,
        "ensemble": result.get("ensemble"),
        "scenario": result.get("scenario"),
    }


def print_run_summary(result: dict) -> None:
    print("\nOrchestrator results:")
    for series_id, item in result.get("signals", {}).items():
        if item is None:
            print(f"- {series_id}: failed")
            continue

        status = item["job"].get("status")
        point_count = len(extract_forecast_series_from_signal(item))
        print(
            f"- {series_id}: status={status}, "
            f"weight={item['weight']}, "
            f"forecast_points={point_count}"
        )

    if "ensemble" in result:
        ensemble = result["ensemble"]
        print("\nEnsemble summary:")
        print(f"- contributing_signals: {ensemble.get('contributing_signals', [])}")
        print(f"- normalized_weights: {ensemble.get('normalized_weights', {})}")
        print(f"- dropped_signals: {ensemble.get('dropped_signals', [])}")

    if "scenario" in result:
        scenario = result["scenario"]
        print("\nScenario classification:")
        print(f"- scenario: {scenario.get('scenario')}")
        print(f"- confidence: {scenario.get('confidence')}")
        print(f"- trigger: {scenario.get('trigger')}")


def _print_result(result: dict) -> None:
    scenario = result.get("scenario", {})
    ensemble = result.get("ensemble", {})

    print(f"Szenario:   {scenario.get('scenario', 'N/A').upper()}")
    print(f"Konfidenz:  {scenario.get('confidence', 'N/A')}")
    print(f"Delta 3M:   {scenario.get('delta_3m', 0):+.3f} pp")
    print(f"Delta 6M:   {scenario.get('delta_6m', 0):+.3f} pp")
    print(f"Inflation:  {scenario.get('inflation_trend', 'N/A')}")
    print(f"Trigger:    {scenario.get('trigger', 'N/A')}")
    print(f"Signale:    {', '.join(ensemble.get('contributing_signals', []))}")
    print(f"Gewichte:   {json.dumps(ensemble.get('normalized_weights', {}))}")
    print()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat")
async def chat(request: Request) -> StreamingResponse:
    """Streaming chat endpoint consumed by the AI SDK `useChat` frontend.

    Accepts the `DefaultChatTransport` body (`{ id, messages, trigger, messageId }`)
    and returns an AI SDK UI message stream over Server-Sent Events. See
    `docs/chat-api.md` for the full wire contract.
    """
    try:
        body = await request.json()
    except Exception as exc:  # noqa: BLE001 - malformed JSON from the client
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    messages = body.get("messages") if isinstance(body, dict) else None
    body_model = body.get("model") if isinstance(body, dict) else None

    service = ChatService(model=body_model if isinstance(body_model, str) else None)

    return StreamingResponse(
        service.stream(messages),
        media_type="text/event-stream",
        headers=ui_stream.UI_MESSAGE_STREAM_HEADERS,
    )


@app.post("/api/forecast/run")
def run_forecast() -> dict:
    """
    Run the US Fed forecasting pipeline and return signals, ensemble, and scenario.

    This can take several minutes while Sybilion jobs complete.
    """
    try:
        fred = FREDClient()
        pipeline = build_pipeline(
            fred=fred,
            payload_builder=FedRatePayloadBuilder(fred),
            artifacts_dir="artifacts/fed_rate_forecast",
        )
        result = pipeline.run(signal_configs=US_SIGNAL_CONFIGS)
        return serialize_pipeline_result(result)
    except EnvironmentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# Serve the built frontend (apps/frontend/dist) from the same origin as the API
# when it exists. API routes are registered above, so they take precedence over
# this catch-all mount. In dev (no build) this block is simply skipped and the
# Vite dev server serves the UI instead.
_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        """Serve a static asset if it exists, otherwise the SPA entrypoint.

        Registered after the API routes, so `/api/*` always wins. Existing
        files (e.g. `/assets/index-*.js`) are served directly; any other path
        falls back to `index.html` for client-side routing.
        """
        candidate = (_FRONTEND_DIST / full_path).resolve()
        # Guard against path traversal outside the dist directory.
        if (
            full_path
            and _FRONTEND_DIST in candidate.parents
            and candidate.is_file()
        ):
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIST / "index.html")


def main() -> None:
    load_env()
    fred = FREDClient()

    # Fed (USA) — default CLI path
    fed_pipeline = build_pipeline(
        fred=fred,
        payload_builder=FedRatePayloadBuilder(fred),
        artifacts_dir="artifacts/fed_rate_forecast",
    )
    print("=" * 50)
    print("FED FORECAST")
    print("=" * 50)
    fed_result = fed_pipeline.run(signal_configs=US_SIGNAL_CONFIGS)
    _print_result(fed_result)

    # ECB (Euro Area)
    ecb_pipeline = build_pipeline(
        fred=fred,
        payload_builder=ECBRatePayloadBuilder(fred),
        artifacts_dir="artifacts/ecb",
    )
    print("=" * 50)
    print("ECB FORECAST")
    print("=" * 50)
    ecb_result = ecb_pipeline.run(signal_configs=ECB_SIGNAL_CONFIGS)
    _print_result(ecb_result)


def serve(host: str | None = None, port: int | None = None) -> None:
    """Run the API server.

    Defaults are deployment-friendly: bind to all interfaces and honour the
    `PORT` (and optional `HOST`) environment variables that hosting platforms
    such as Railway inject. Pass explicit args to override.
    """
    resolved_host = host or os.environ.get("HOST", "0.0.0.0")
    resolved_port = port or int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=resolved_host, port=resolved_port)


if __name__ == "__main__":
    serve()
