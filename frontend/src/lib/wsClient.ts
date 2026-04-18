/**
 * lib/wsClient.ts
 *
 * Thin typed wrapper around the browser WebSocket API.
 * Provides a clean interface used by the useWebSocket hook.
 */

import type { ReviewChunk, ReviewRequest } from "@shared/types";

export type WsMessageHandler = (chunk: ReviewChunk) => void;
export type WsStatusHandler  = (open: boolean) => void;

export interface WsClient {
  send: (request: ReviewRequest) => void;
  close: () => void;
  isOpen: () => boolean;
}

const WS_URL = import.meta.env["VITE_WS_URL"] as string | undefined
  ?? "ws://localhost:3001";

/**
 * Create and return a managed WebSocket client.
 *
 * @param onChunk  — called for every ReviewChunk received
 * @param onStatus — called with `true` on open, `false` on close/error
 * @param onError  — called with a human-readable error string
 */
export function createWsClient(
  onChunk:  WsMessageHandler,
  onStatus: WsStatusHandler,
  onError:  (msg: string) => void,
): WsClient {
  const ws = new WebSocket(WS_URL);

  ws.addEventListener("open", () => {
    onStatus(true);
  });

  ws.addEventListener("close", () => {
    onStatus(false);
  });

  ws.addEventListener("error", () => {
    onError("WebSocket connection error. Is the backend running?");
    onStatus(false);
  });

  ws.addEventListener("message", (event: MessageEvent<string>) => {
    try {
      const chunk = JSON.parse(event.data) as ReviewChunk;
      onChunk(chunk);
    } catch {
      console.warn("[wsClient] Received non-JSON message:", event.data);
    }
  });

  return {
    send(request: ReviewRequest) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(request));
      }
    },
    close() {
      ws.close();
    },
    isOpen() {
      return ws.readyState === WebSocket.OPEN;
    },
  };
}
