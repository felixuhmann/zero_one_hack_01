"""Chat service: turns an AI SDK chat request into a streamed UI message stream.

The frontend posts ``{ id, messages, trigger, messageId }`` (Vercel AI SDK v6
``DefaultChatTransport``) and expects an SSE *UI message stream* back. This
module converts the incoming ``UIMessage[]`` into OpenAI-style chat messages,
calls an OpenAI-compatible Chat Completions endpoint with streaming enabled
(Vercel AI Gateway by default), and re-emits the deltas as protocol chunks via
:mod:`forecasting.chat.ui_stream`.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from forecasting.chat import ui_stream

# Vercel AI Gateway is OpenAI-compatible. Models are addressed as
# "<provider>/<model>" (e.g. "anthropic/claude-sonnet-4.6").
DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1"
DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"

SYSTEM_PROMPT = (
    "You are the Sybilion forecasting copilot, an expert macro-economics and "
    "decision-support agent embedded in a central-bank rate forecasting app.\n"
    "You help users reason about probabilistic forecasts (Fed/ECB policy rates, "
    "inflation, macro signals), interpret ensemble scenarios, and decide what to "
    "do next.\n\n"
    "Guidelines:\n"
    "- Be precise, concise, and honest about uncertainty; never invent numbers.\n"
    "- When you reference data the user hasn't provided, say so and explain how "
    "they'd obtain it (e.g. running the forecast pipeline).\n"
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

    def _build_messages(self, ui_messages: Any) -> list[dict[str, str]]:
        history = parse_ui_messages(ui_messages)
        return [{"role": "system", "content": SYSTEM_PROMPT}, *history]

    async def stream(self, ui_messages: Any) -> AsyncIterator[str]:
        """Yield SSE-encoded UI message stream chunks for one assistant turn."""
        message_id = f"msg_{uuid.uuid4().hex}"
        text_id = f"txt_{uuid.uuid4().hex}"
        reasoning_id = f"rsn_{uuid.uuid4().hex}"

        yield ui_stream.start(
            message_id,
            metadata={"model": self.model, "createdAt": int(time.time() * 1000)},
        )
        yield ui_stream.start_step()

        text_open = False
        reasoning_open = False
        total_tokens: int | None = None

        try:
            client = self._client()
            messages = self._build_messages(ui_messages)
            completion = await client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
            )

            async for chunk in completion:
                if getattr(chunk, "usage", None) is not None:
                    total = getattr(chunk.usage, "total_tokens", None)
                    if isinstance(total, int):
                        total_tokens = total

                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta is None:
                    continue

                # Some gateway/provider models stream a reasoning trace.
                reasoning = getattr(delta, "reasoning", None) or getattr(
                    delta, "reasoning_content", None
                )
                if reasoning:
                    if not reasoning_open:
                        yield ui_stream.reasoning_start(reasoning_id)
                        reasoning_open = True
                    yield ui_stream.reasoning_delta(reasoning_id, reasoning)

                content = getattr(delta, "content", None)
                if content:
                    if reasoning_open:
                        yield ui_stream.reasoning_end(reasoning_id)
                        reasoning_open = False
                    if not text_open:
                        yield ui_stream.text_start(text_id)
                        text_open = True
                    yield ui_stream.text_delta(text_id, content)

            if reasoning_open:
                yield ui_stream.reasoning_end(reasoning_id)
                reasoning_open = False
            if text_open:
                yield ui_stream.text_end(text_id)
                text_open = False

            yield ui_stream.finish_step()
            finish_meta: dict[str, Any] = {}
            if total_tokens is not None:
                finish_meta["totalTokens"] = total_tokens
            yield ui_stream.finish(finish_meta or None)
        except ChatConfigError as exc:
            if text_open:
                yield ui_stream.text_end(text_id)
            yield ui_stream.error(str(exc))
        except Exception as exc:  # noqa: BLE001 - surface any provider error to the UI
            if text_open:
                yield ui_stream.text_end(text_id)
            yield ui_stream.error(f"Upstream model error: {exc}")
        finally:
            yield ui_stream.DONE
