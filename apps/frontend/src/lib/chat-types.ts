import type {
  DynamicToolUIPart,
  ToolUIPart,
  UIDataTypes,
  UIMessage,
  UITools,
} from "ai";

/**
 * Per-message metadata streamed alongside the assistant response.
 *
 * The backend may attach this via the AI SDK UI message stream
 * (e.g. `streamText(...).toUIMessageStreamResponse({ messageMetadata })`).
 * All fields are optional so the UI degrades gracefully when absent.
 */
export interface ChatMessageMetadata {
  /** Model id that produced the message, e.g. "claude-sonnet-4". */
  model?: string;
  /** Unix epoch (ms) the message was created. */
  createdAt?: number;
  /** Total tokens used for the assistant turn, when reported. */
  totalTokens?: number;
}

/**
 * Custom data parts the backend can stream as `data-*` parts.
 *
 * Add typed entries here as the agent grows (status updates, plans, etc.).
 * Keys map to part types of the form `data-<key>` in the stream.
 */
export interface ChatDataParts extends UIDataTypes {
  /** Free-form status line shown while the agent works. */
  status: { label: string; state: "pending" | "done" };
}

/** Central bank region a forecast tool operates on. */
export type ForecastRegion = "fed" | "ecb";

/** Compact result returned by the forecast snapshot/run tools. */
export interface ForecastToolResult {
  region?: ForecastRegion;
  region_label?: string;
  available?: boolean;
  message?: string;
  generated_at?: number;
  saved_snapshot?: string;
  scenario?: Record<string, unknown>;
  ensemble?: Record<string, unknown>;
  signals?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Tools the agent can call. The backend (`apps/backend/forecasting/chat/tools.py`)
 * owns execution and streams `tool-<name>` parts; typing them here makes those
 * parts strongly typed. Rendering also works generically via {@link ChatToolPart}.
 */
export interface ChatTools extends UITools {
  read_latest_forecast: {
    input: { region?: ForecastRegion };
    output: ForecastToolResult;
  };
  run_forecast_pipeline: {
    input: { region?: ForecastRegion };
    output: ForecastToolResult;
  };
  get_forecast_drivers: {
    input: { region?: ForecastRegion; series_id?: string; periods?: number };
    output: {
      region?: ForecastRegion;
      series_id?: string;
      periods?: number;
      drivers?: unknown;
      [key: string]: unknown;
    };
  };
}

/**
 * The single message type shared across the chat UI. Mirrors what the
 * `/api/chat` backend must produce in its UI message stream.
 */
export type ChatMessage = UIMessage<ChatMessageMetadata, ChatDataParts, ChatTools>;

/**
 * A renderable tool part. We keep the general tool-part union (rather than
 * `ToolUIPart<ChatTools>`, which collapses to `never` while the toolset is
 * empty) so tool calls from the backend render before tools are typed here.
 */
export type ChatToolPart = ToolUIPart | DynamicToolUIPart;
