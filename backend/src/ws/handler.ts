/**
 * ws/handler.ts
 *
 * WebSocket connection handler — the heart of the backend.
 *
 * Lifecycle per connection
 * ─────────────────────────
 * 1. Client connects  → server assigns a UUID session ID, sends it back
 *                       as a `start` ReviewChunk.
 * 2. Client sends a ReviewRequest JSON message
 *    → server validates it, then opens a streaming call to the AI service.
 * 3. Every ReviewChunk from the AI service is forwarded to the WebSocket
 *    client in real-time (`partial`, `complete`, `error`, `ping`).
 * 4. When a `complete` chunk arrives → the full ReviewSchema is saved
 *    to SQLite via `saveSession()`.
 * 5. On WebSocket close / error → the in-flight HTTP stream is cancelled
 *    via an AbortController.
 */

import { WebSocket, WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import type { IncomingMessage } from "http";
import type {
  ReviewChunk,
  ReviewRequest,
} from "../../../types/index";
import { streamFromAiService } from "../services/aiClient";
import { saveSession } from "../db/database";

// ── Helper: send a typed ReviewChunk to a WebSocket client ───

function sendChunk(ws: WebSocket, chunk: ReviewChunk): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(chunk));
}

function nowIso(): string {
  return new Date().toISOString();
}

// ── Per-connection state ──────────────────────────────────────

interface ConnectionState {
  sessionId: string;
  /** AbortController used to cancel an in-flight AI request */
  abortController: AbortController | null;
  /** Whether a review is currently being streamed */
  isStreaming: boolean;
}

// ── Main handler ──────────────────────────────────────────────

/**
 * Attach connection-level event listeners to a newly accepted WebSocket.
 * Called once per inbound connection from `setupWebSocketServer`.
 */
function handleConnection(ws: WebSocket, _req: IncomingMessage): void {
  const state: ConnectionState = {
    sessionId: uuidv4(),
    abortController: null,
    isStreaming: false,
  };

  console.log(`[ws] New connection → session ${state.sessionId}`);

  // ── Step 1: Announce the session ID ────────────────────────
  sendChunk(ws, {
    sessionId: state.sessionId,
    type: "start",
    timestamp: nowIso(),
  });

  // ── Step 2: Handle incoming messages ───────────────────────
  ws.on("message", (raw) => {
    void handleMessage(ws, state, raw.toString());
  });

  // ── Step 5: Cleanup on close ────────────────────────────────
  ws.on("close", (code, reason) => {
    console.log(
      `[ws] Session ${state.sessionId} closed (code=${code} reason=${reason.toString()})`
    );
    state.abortController?.abort();
  });

  ws.on("error", (err) => {
    console.error(`[ws] Session ${state.sessionId} error:`, err);
    state.abortController?.abort();
  });
}

/**
 * Process a raw WebSocket message.
 * Validates that it is a well-formed ReviewRequest and kicks off streaming.
 */
async function handleMessage(
  ws: WebSocket,
  state: ConnectionState,
  raw: string
): Promise<void> {
  // Guard: only one review per session at a time
  if (state.isStreaming) {
    sendChunk(ws, {
      sessionId: state.sessionId,
      type: "error",
      error: "A review is already in progress for this session.",
      timestamp: nowIso(),
    });
    return;
  }

  // ── Parse & validate the incoming ReviewRequest ─────────────
  let request: ReviewRequest;
  try {
    request = JSON.parse(raw) as ReviewRequest;
    if (!request.code?.trim()) throw new Error("code is required");
    if (!request.language) throw new Error("language is required");
  } catch (err) {
    sendChunk(ws, {
      sessionId: state.sessionId,
      type: "error",
      error: `Invalid request: ${(err as Error).message}`,
      timestamp: nowIso(),
    });
    return;
  }

  // Stamp the server-side session ID (overrides whatever the client sent)
  const reviewRequest: ReviewRequest = {
    ...request,
    sessionId: state.sessionId,
    createdAt: request.createdAt ?? nowIso(),
  };

  // ── Stream from the AI service ──────────────────────────────
  state.isStreaming = true;
  state.abortController = new AbortController();

  try {
    for await (const chunk of streamFromAiService(reviewRequest)) {
      // Forward every chunk to the WebSocket client immediately
      sendChunk(ws, chunk);

      // ── Step 4: Persist when complete ────────────────────────
      if (chunk.type === "complete" && chunk.data) {
        try {
          saveSession({
            session_id: state.sessionId,
            language: reviewRequest.language,
            filename: reviewRequest.filename ?? null,
            code: reviewRequest.code,
            review: chunk.data,
          });
          console.log(
            `[ws] Session ${state.sessionId} saved to SQLite (score=${chunk.data.score})`
          );
        } catch (dbErr) {
          // DB failure is non-fatal — the client still gets its result
          console.error(
            `[ws] Failed to save session ${state.sessionId}:`,
            dbErr
          );
        }
      }

      // Stop processing if the stream is finished
      if (chunk.type === "complete" || chunk.type === "error") break;
    }
  } catch (err) {
    console.error(
      `[ws] Streaming error for session ${state.sessionId}:`,
      err
    );
    sendChunk(ws, {
      sessionId: state.sessionId,
      type: "error",
      error: "Failed to connect to the AI service. Please try again.",
      timestamp: nowIso(),
    });
  } finally {
    state.isStreaming = false;
    state.abortController = null;
  }
}

// ── Server factory ────────────────────────────────────────────

/**
 * Create and configure the WebSocketServer.
 *
 * Pass `server: httpServer` to attach WS to the same port as Express,
 * or `port: N` to run on a dedicated port.
 */
export function setupWebSocketServer(
  options: ConstructorParameters<typeof WebSocketServer>[0]
): WebSocketServer {
  const wss = new WebSocketServer(options);

  wss.on("connection", handleConnection);

  wss.on("error", (err) => {
    console.error("[wss] Server error:", err);
  });

  console.log("[wss] WebSocket server ready");
  return wss;
}
