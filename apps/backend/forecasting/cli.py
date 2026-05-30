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
from forecasting.pipeline import serialize_result
from forecasting.regions import REGIONS, RegionError, build_pipeline, resolve_region

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
    title="Rate Forecast API",
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


def _print_result(result: dict) -> None:
    scenario = result.get("scenario", {})
    ensemble = result.get("ensemble", {})

    print(f"Scenario:   {scenario.get('scenario', 'N/A').upper()}")
    print(f"Confidence: {scenario.get('confidence', 'N/A')}")
    print(f"Delta 3M:   {scenario.get('delta_3m', 0):+.3f} pp")
    print(f"Delta 6M:   {scenario.get('delta_6m', 0):+.3f} pp")
    print(f"Inflation:  {scenario.get('inflation_trend', 'N/A')}")
    print(f"Trigger:    {scenario.get('trigger', 'N/A')}")
    print(f"Signals:    {', '.join(ensemble.get('contributing_signals', []))}")
    print(f"Weights:    {json.dumps(ensemble.get('normalized_weights', {}))}")
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
def run_forecast(region: str = "fed") -> dict:
    """Run a region's forecasting pipeline and return signals, ensemble, scenario.

    `region` is 'fed' (default) or 'ecb'. This can take several minutes while
    Sybilion jobs complete.
    """
    try:
        cfg = resolve_region(region)
    except RegionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        pipeline = build_pipeline(cfg)
        result = pipeline.run(signal_configs=cfg.signal_configs)
        return serialize_result(result)
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
    """Run every configured region's pipeline and print a short summary."""
    load_env()
    for cfg in REGIONS.values():
        print("=" * 50)
        print(f"{cfg.label} FORECAST")
        print("=" * 50)
        result = build_pipeline(cfg).run(signal_configs=cfg.signal_configs)
        _print_result(result)


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
