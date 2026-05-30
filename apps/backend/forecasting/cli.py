from __future__ import annotations

import json

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

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

app = FastAPI(
    title="Fed Rate Forecast API",
    description="Runs the FRED → Sybilion → ensemble → scenario pipeline.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
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


def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    serve()
