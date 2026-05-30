"""Encoders for the Vercel AI SDK **UI message stream** protocol.

The frontend (`apps/frontend`) consumes this over Server-Sent Events via the AI
SDK v6 ``DefaultChatTransport``. Each event is a single ``data:`` line holding a
compact JSON chunk, terminated by a blank line. The stream ends with the literal
``data: [DONE]`` marker.

Wire contract reference: ``docs/chat-api.md`` and the AI SDK "Stream Protocols"
docs. A custom (non-JS) backend MUST also set the response header
``x-vercel-ai-ui-message-stream: v1`` (see :data:`UI_MESSAGE_STREAM_HEADERS`).
"""

from __future__ import annotations

import json
from typing import Any

# Headers every UI-message-stream response must carry.
UI_MESSAGE_STREAM_HEADERS: dict[str, str] = {
    "x-vercel-ai-ui-message-stream": "v1",
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    # Disable proxy buffering (e.g. nginx) so deltas flush immediately.
    "X-Accel-Buffering": "no",
}


def encode_chunk(chunk: dict[str, Any]) -> str:
    """Serialize a single protocol chunk as one SSE event."""
    return f"data: {json.dumps(chunk, separators=(',', ':'), ensure_ascii=False)}\n\n"


DONE = "data: [DONE]\n\n"


def start(message_id: str, metadata: dict[str, Any] | None = None) -> str:
    chunk: dict[str, Any] = {"type": "start", "messageId": message_id}
    if metadata:
        chunk["messageMetadata"] = metadata
    return encode_chunk(chunk)


def start_step() -> str:
    return encode_chunk({"type": "start-step"})


def text_start(text_id: str) -> str:
    return encode_chunk({"type": "text-start", "id": text_id})


def text_delta(text_id: str, delta: str) -> str:
    return encode_chunk({"type": "text-delta", "id": text_id, "delta": delta})


def text_end(text_id: str) -> str:
    return encode_chunk({"type": "text-end", "id": text_id})


def reasoning_start(reasoning_id: str) -> str:
    return encode_chunk({"type": "reasoning-start", "id": reasoning_id})


def reasoning_delta(reasoning_id: str, delta: str) -> str:
    return encode_chunk({"type": "reasoning-delta", "id": reasoning_id, "delta": delta})


def reasoning_end(reasoning_id: str) -> str:
    return encode_chunk({"type": "reasoning-end", "id": reasoning_id})


def tool_input_start(tool_call_id: str, tool_name: str) -> str:
    return encode_chunk(
        {"type": "tool-input-start", "toolCallId": tool_call_id, "toolName": tool_name}
    )


def tool_input_available(
    tool_call_id: str, tool_name: str, tool_input: Any
) -> str:
    return encode_chunk(
        {
            "type": "tool-input-available",
            "toolCallId": tool_call_id,
            "toolName": tool_name,
            "input": tool_input,
        }
    )


def tool_output_available(tool_call_id: str, output: Any) -> str:
    return encode_chunk(
        {"type": "tool-output-available", "toolCallId": tool_call_id, "output": output}
    )


def tool_output_error(tool_call_id: str, error_text: str) -> str:
    return encode_chunk(
        {
            "type": "tool-output-error",
            "toolCallId": tool_call_id,
            "errorText": error_text,
        }
    )


def data_part(name: str, data: Any) -> str:
    """Emit a custom typed data part (`data-<name>`), see `chat-types.ts`."""
    return encode_chunk({"type": f"data-{name}", "data": data})


def finish_step() -> str:
    return encode_chunk({"type": "finish-step"})


def finish(metadata: dict[str, Any] | None = None) -> str:
    chunk: dict[str, Any] = {"type": "finish"}
    if metadata:
        chunk["messageMetadata"] = metadata
    return encode_chunk(chunk)


def error(message: str) -> str:
    return encode_chunk({"type": "error", "errorText": message})
