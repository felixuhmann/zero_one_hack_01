import asyncio
import json

from forecasting.env import load_env

load_env()

from forecasting.chat import tools
from forecasting.chat.service import ChatService

# Seed a small Fed snapshot so read_latest_forecast returns instantly.
FAKE = {
    "signals": {
        "FEDFUNDS": {
            "series_id": "FEDFUNDS",
            "weight": 0.30,
            "job": {"status": "completed"},
            "forecast": {"data": {"forecast_series": {"2026-06-01": {"forecast": 5.1}, "2026-07-01": {"forecast": 4.9}}}},
        }
    },
    "ensemble": {
        "contributing_signals": ["FEDFUNDS"],
        "normalized_weights": {"FEDFUNDS": 1.0},
        "dropped_signals": [],
        "ensemble_forecast": {"2026-06-01": 5.1, "2026-07-01": 4.9, "2026-08-01": 4.75},
    },
    "scenario": {
        "scenario": "dovish_pivot",
        "confidence": "medium",
        "delta_3m": -0.35,
        "delta_6m": -0.6,
        "inflation_trend": "cooling",
        "trigger": "core PCE decelerating, labor softening",
    },
}
path = tools._save_snapshot("fed", FAKE)
print("seeded snapshot:", path)
print("read_latest direct:", json.dumps(tools.read_latest_forecast("fed"))[:400])


def ui_msg(role, text):
    return {"id": f"{role}-1", "role": role, "parts": [{"type": "text", "text": text}]}


async def run(prompt):
    print(f"\n=== PROMPT: {prompt!r} ===")
    service = ChatService()
    seen = []
    text_buf = []
    async for sse in service.stream([ui_msg("user", prompt)]):
        if not sse.startswith("data: "):
            continue
        body = sse[len("data: "):].strip()
        if body == "[DONE]":
            seen.append("[DONE]")
            continue
        try:
            chunk = json.loads(body)
        except json.JSONDecodeError:
            continue
        t = chunk.get("type")
        seen.append(t)
        if t == "text-delta":
            text_buf.append(chunk.get("delta", ""))
        elif t == "tool-input-available":
            print(f"  TOOL CALL -> {chunk.get('toolName')} input={chunk.get('input')}")
        elif t == "tool-output-available":
            print(f"  TOOL OK   -> {json.dumps(chunk.get('output'))[:200]}")
        elif t == "tool-output-error":
            print(f"  TOOL ERR  -> {chunk.get('errorText')}")
        elif t == "error":
            print(f"  STREAM ERROR -> {chunk.get('errorText')}")
    print("  events:", [s for s in seen])
    print("  final text:", "".join(text_buf)[:500])


asyncio.run(
    run(
        "Read the latest saved Fed forecast snapshot and summarize the scenario. "
        "Do NOT run a fresh pipeline; only read the latest snapshot."
    )
)
