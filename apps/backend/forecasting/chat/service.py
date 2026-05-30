"""Chat service: turns an AI SDK chat request into a streamed UI message stream.

The frontend posts ``{ id, messages, trigger, messageId }`` (Vercel AI SDK v6
``DefaultChatTransport``) and expects an SSE *UI message stream* back. This
module converts the incoming ``UIMessage[]`` into OpenAI-style chat messages,
calls an OpenAI-compatible Chat Completions endpoint with streaming enabled
(Vercel AI Gateway by default), and re-emits the deltas as protocol chunks via
:mod:`forecasting.chat.ui_stream`.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from forecasting.chat import ui_stream
from forecasting.chat import tools as chat_tools

# Vercel AI Gateway is OpenAI-compatible. Models are addressed as
# "<provider>/<model>" (e.g. "anthropic/claude-sonnet-4.6").
DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1"
DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"

# Hard cap on model<->tool round-trips per user turn (prevents runaway loops).
MAX_TOOL_ITERATIONS = 4

SYSTEM_PROMPT = (
    "You are the Sybilion forecasting copilot, an expert macro-economics and "
    "decision-support agent embedded in a central-bank rate forecasting app.\n"
    "You help users reason about probabilistic forecasts (Fed/ECB policy rates, "
    "inflation, macro signals), interpret ensemble scenarios, and decide what to "
    "do next.\n\n"
    "You can call tools to fetch live, Sybilion-backed data instead of guessing:\n"
    "- read_latest_forecast(region): instantly returns the most recent saved "
    "forecast snapshot (scenario, ensemble path, per-signal status). ALWAYS try "
    "this first when the user asks about the current/latest forecast or scenario.\n"
    "- run_forecast_pipeline(region): runs the full FRED -> Sybilion -> ensemble "
    "-> scenario pipeline. This is SLOW (parallel forecast jobs that take several "
    "minutes). Only call it when the user explicitly asks for a fresh run, or when "
    "read_latest_forecast reports no snapshot exists. Warn the user it may take a "
    "few minutes before calling it.\n"
    "- get_forecast_drivers(region, series_id, periods): returns the key drivers "
    "(explanatory features) behind a single series' forecast.\n"
    "region is 'fed' (US Federal Reserve) or 'ecb' (European Central Bank).\n\n"
    "Guidelines:\n"
    "- Be precise, concise, and honest about uncertainty; never invent numbers. "
    "When you cite figures, they must come from a tool result.\n"
    "- After a tool returns, interpret the result for the user; don't just dump "
    "the JSON. Explain what the scenario/drivers imply for a decision.\n"
    "- Use clean Markdown: short paragraphs, bullet lists, and fenced code blocks "
    "for code. Use LaTeX (\\( ... \\)) for math when helpful.\n"
    "- Prefer actionable, decision-oriented answers over generic explanations."
)


class ChatConfigError(RuntimeError):
    """Raised when the chat backend is not configured (e.g. missing API key)."""


def _extract_text(parts: Any) -> str:
    """Concatenate the text content of a UIMessage's ``parts`` array."""
    if not isinstance(parts, list):
        return ""
    chunks: list[str] = []
    for part in parts:
        if isinstance(part, dict) and part.get("type") == "text":
            text = part.get("text")
            if isinstance(text, str) and text:
                chunks.append(text)
    return "\n\n".join(chunks)


def parse_ui_messages(messages: Any) -> list[dict[str, str]]:
    """Convert AI SDK ``UIMessage[]`` into OpenAI chat messages.

    Only text parts are forwarded; non-text parts (tools, files, data) are
    ignored for now. Messages that carry no text are skipped.
    """
    if not isinstance(messages, list):
        return []

    out: list[dict[str, str]] = []
    for message in messages:
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        if role not in ("user", "assistant", "system"):
            continue
        # v5/v6 carry content in `parts`; tolerate a plain `content` string too.
        text = _extract_text(message.get("parts"))
        if not text and isinstance(message.get("content"), str):
            text = message["content"]
        if not text:
            continue
        out.append({"role": role, "content": text})
    return out


class ChatService:
    """Streams assistant turns for the ``/api/chat`` endpoint."""

    def __init__(
        self,
        *,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.model = model or os.environ.get("LLM_MODEL") or DEFAULT_MODEL
        self.base_url = base_url or os.environ.get("LLM_BASE_URL") or DEFAULT_BASE_URL
        # AI_GATEWAY_API_KEY is the gateway's native var; fall back to generic ones.
        self.api_key = (
            api_key
            or os.environ.get("AI_GATEWAY_API_KEY")
            or os.environ.get("LLM_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
        )

    def _client(self) -> AsyncOpenAI:
        if not self.api_key:
            raise ChatConfigError(
                "No LLM API key configured. Set AI_GATEWAY_API_KEY (Vercel AI "
                "Gateway) in your repo-root .env, then restart the backend."
            )
        return AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)

    def _build_messages(self, ui_messages: Any) -> list[dict[str, Any]]:
        history = parse_ui_messages(ui_messages)
        return [{"role": "system", "content": SYSTEM_PROMPT}, *history]

    async def stream(self, ui_messages: Any) -> AsyncIterator[str]:
        """Yield SSE-encoded UI message stream chunks for one assistant turn.

        Runs a bounded model<->tool loop: each iteration streams one model
        response; if the model requested tool calls, they are executed (emitting
        ``tool-*`` UI events), their results appended to the conversation, and the
        model is called again until it produces a final text answer.
        """
        message_id = f"msg_{uuid.uuid4().hex}"

        yield ui_stream.start(
            message_id,
            metadata={"model": self.model, "createdAt": int(time.time() * 1000)},
        )

        total_tokens: int | None = None

        try:
            client = self._client()
            messages = self._build_messages(ui_messages)

            for iteration in range(MAX_TOOL_ITERATIONS):
                # On the final allowed iteration, force a text answer so we never
                # end a turn on an unanswered tool call.
                allow_tools = iteration < MAX_TOOL_ITERATIONS - 1

                step_tokens, tool_calls = None, None
                async for item in self._run_model_step(
                    client, messages, allow_tools=allow_tools
                ):
                    kind, payload = item
                    if kind == "chunk":
                        yield payload
                    elif kind == "usage":
                        step_tokens = payload
                    elif kind == "tool_calls":
                        tool_calls = payload

                if step_tokens is not None:
                    total_tokens = step_tokens

                if not tool_calls:
                    break

                # Record the assistant turn that requested the tools, then run them.
                messages.append(self._assistant_tool_call_message(tool_calls))
                for call in tool_calls:
                    async for chunk in self._execute_tool_call(call, messages):
                        yield chunk

            finish_meta: dict[str, Any] = {}
            if total_tokens is not None:
                finish_meta["totalTokens"] = total_tokens
            yield ui_stream.finish(finish_meta or None)
        except ChatConfigError as exc:
            yield ui_stream.error(str(exc))
        except Exception as exc:  # noqa: BLE001 - surface any provider error to the UI
            yield ui_stream.error(f"Upstream model error: {exc}")
        finally:
            yield ui_stream.DONE

    async def _run_model_step(
        self,
        client: AsyncOpenAI,
        messages: list[dict[str, Any]],
        *,
        allow_tools: bool,
    ) -> AsyncIterator[tuple[str, Any]]:
        """Stream one model response.

        Yields ``("chunk", sse_str)`` for UI events, ``("usage", int)`` once, and
        ``("tool_calls", list)`` if the model requested tools.
        """
        text_id = f"txt_{uuid.uuid4().hex}"
        reasoning_id = f"rsn_{uuid.uuid4().hex}"
        text_open = False
        reasoning_open = False
        tool_acc: dict[int, dict[str, Any]] = {}

        request: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if allow_tools:
            request["tools"] = chat_tools.TOOL_SPECS
            request["tool_choice"] = "auto"

        yield ("chunk", ui_stream.start_step())

        completion = await client.chat.completions.create(**request)
        async for chunk in completion:
            if getattr(chunk, "usage", None) is not None:
                total = getattr(chunk.usage, "total_tokens", None)
                if isinstance(total, int):
                    yield ("usage", total)

            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta is None:
                continue

            reasoning = getattr(delta, "reasoning", None) or getattr(
                delta, "reasoning_content", None
            )
            if reasoning:
                if not reasoning_open:
                    yield ("chunk", ui_stream.reasoning_start(reasoning_id))
                    reasoning_open = True
                yield ("chunk", ui_stream.reasoning_delta(reasoning_id, reasoning))

            for tc in getattr(delta, "tool_calls", None) or []:
                slot = tool_acc.setdefault(
                    tc.index, {"id": None, "name": None, "arguments": ""}
                )
                if getattr(tc, "id", None):
                    slot["id"] = tc.id
                fn = getattr(tc, "function", None)
                if fn is not None:
                    if getattr(fn, "name", None):
                        slot["name"] = fn.name
                    if getattr(fn, "arguments", None):
                        slot["arguments"] += fn.arguments

            content = getattr(delta, "content", None)
            if content:
                if reasoning_open:
                    yield ("chunk", ui_stream.reasoning_end(reasoning_id))
                    reasoning_open = False
                if not text_open:
                    yield ("chunk", ui_stream.text_start(text_id))
                    text_open = True
                yield ("chunk", ui_stream.text_delta(text_id, content))

        if reasoning_open:
            yield ("chunk", ui_stream.reasoning_end(reasoning_id))
        if text_open:
            yield ("chunk", ui_stream.text_end(text_id))

        yield ("chunk", ui_stream.finish_step())

        tool_calls = [
            {
                "id": slot["id"] or f"call_{uuid.uuid4().hex}",
                "name": slot["name"],
                "arguments": slot["arguments"],
            }
            for _, slot in sorted(tool_acc.items())
            if slot["name"]
        ]
        if tool_calls:
            yield ("tool_calls", tool_calls)

    @staticmethod
    def _assistant_tool_call_message(tool_calls: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": call["id"],
                    "type": "function",
                    "function": {
                        "name": call["name"],
                        "arguments": call["arguments"] or "{}",
                    },
                }
                for call in tool_calls
            ],
        }

    async def _execute_tool_call(
        self,
        call: dict[str, Any],
        messages: list[dict[str, Any]],
    ) -> AsyncIterator[str]:
        """Emit tool UI events, run the tool off the event loop, append its result."""
        call_id = call["id"]
        name = call["name"]
        try:
            arguments = json.loads(call["arguments"]) if call["arguments"] else {}
            if not isinstance(arguments, dict):
                arguments = {}
        except json.JSONDecodeError:
            arguments = {}

        yield ui_stream.tool_input_start(call_id, name)
        yield ui_stream.tool_input_available(call_id, name, arguments)

        try:
            result = await asyncio.to_thread(chat_tools.execute_tool, name, arguments)
            yield ui_stream.tool_output_available(call_id, result)
            tool_content = json.dumps(result, ensure_ascii=False)
        except Exception as exc:  # noqa: BLE001 - report failure to UI and model
            error_text = str(exc) or exc.__class__.__name__
            yield ui_stream.tool_output_error(call_id, error_text)
            tool_content = json.dumps({"error": error_text})

        messages.append(
            {"role": "tool", "tool_call_id": call_id, "content": tool_content}
        )
