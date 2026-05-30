"""Chat endpoint: bridges the Vercel AI SDK UI message stream protocol to an
OpenAI-compatible LLM (Vercel AI Gateway by default)."""

from forecasting.chat.service import ChatService, ChatConfigError, parse_ui_messages

__all__ = ["ChatService", "ChatConfigError", "parse_ui_messages"]
