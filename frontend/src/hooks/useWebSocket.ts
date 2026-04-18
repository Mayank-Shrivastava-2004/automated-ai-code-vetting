/**
 * hooks/useWebSocket.ts
 *
 * Manages the full WebSocket lifecycle:
 *  - Auto-connects on mount
 *  - Exponential-backoff reconnection (up to 5 attempts)
 *  - Verbose console logging in dev for easy debugging
 *  - Exposes submitReview() to trigger a code review
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ReviewChunk, ReviewSchema, SupportedLanguage } from "@shared/types";

export type ReviewStatus = "idle" | "connecting" | "streaming" | "complete" | "error";

export interface UseWebSocketReturn {
  status:        ReviewStatus;
  connected:     boolean;
  rawStream:     string;
  review:        ReviewSchema | null;
  errorMsg:      string | null;
  sessionId:     string | null;
  submitReview:  (code: string, language: SupportedLanguage, filename?: string) => void;
  reset:         () => void;
}

// ── Config ────────────────────────────────────────────────────

const WS_URL: string =
  (import.meta.env["VITE_WS_URL"] as string | undefined) ??
  "ws://localhost:3001";

const MAX_RETRIES    = 5;
const BASE_DELAY_MS  = 1000;  // 1 s → 2 s → 4 s → 8 s → 16 s

// ── Hook ──────────────────────────────────────────────────────

export function useWebSocket(): UseWebSocketReturn {
  const [status,    setStatus]    = useState<ReviewStatus>("idle");
  const [connected, setConnected] = useState(false);
  const [rawStream, setRawStream] = useState("");
  const [review,    setReview]    = useState<ReviewSchema | null>(null);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const wsRef         = useRef<WebSocket | null>(null);
  const retryCount    = useRef(0);
  const retryTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether a review is currently in-flight (for the start-chunk guard)
  const isReviewing   = useRef(false);

  // ── Connect ────────────────────────────────────────────────
  const connect = useCallback(() => {
    // Don't open a second socket if one is already open/connecting
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
       wsRef.current.readyState === WebSocket.CONNECTING)
    ) return;

    console.log(`[WS] Connecting to ${WS_URL} (attempt ${retryCount.current + 1})`);
    setStatus("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      console.log("[WS] Connection established ✓");
      retryCount.current = 0;
      setConnected(true);
      // Stay idle — don't change status here, submitReview handles that
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
      console.log("[WS] RAW EVENT DATA:", event.data);

      let chunk: ReviewChunk;
      try {
        chunk = JSON.parse(event.data) as ReviewChunk;
      } catch {
        console.warn("[WS] Received non-JSON frame:", event.data);
        return;
      }

      console.debug("[WS] chunk received:", chunk.type, chunk);

      switch (chunk.type) {
        case "start":
          // Server handshake — stores session ID, does NOT start streaming.
          // (submitReview already set status="streaming" before sending.)
          setSessionId(chunk.sessionId);
          break;

        case "partial":
          if (chunk.raw) {
            setRawStream((prev) => prev + chunk.raw);
          }
          break;

        case "complete":
          if (chunk.data) {
            setReview(chunk.data);
            setStatus("complete");
            isReviewing.current = false;
          }
          break;

        case "error":
          console.error("[WS] Server error chunk:", chunk.error);
          setErrorMsg(chunk.error ?? "The server encountered an error.");
          setStatus("error");
          isReviewing.current = false;
          break;

        case "ping":
          break;  // keep-alive — ignore
      }
    });

    ws.addEventListener("close", (event) => {
      console.warn(`[WS] Connection closed (code=${event.code} reason=${event.reason})`);
      setConnected(false);

      if (isReviewing.current) {
        setErrorMsg("Connection lost during review. Please try again.");
        setStatus("error");
        isReviewing.current = false;
      } else {
        // Revert to idle if we weren't streaming
        setStatus((prev) => prev === "connecting" || prev === "idle" ? "idle" : prev);
      }

      // Exponential-backoff reconnection
      if (retryCount.current < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retryCount.current);
        retryCount.current += 1;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${retryCount.current}/${MAX_RETRIES})…`);
        retryTimeout.current = setTimeout(connect, delay);
      } else {
        console.error("[WS] Max retries reached. Is the backend running on port 3001?");
        setErrorMsg(
          `Cannot connect to backend at ${WS_URL}. ` +
          "Make sure the backend is running (npx tsx watch src/server.ts)."
        );
        setStatus("error");
      }
    });

    ws.addEventListener("error", () => {
      // The browser fires 'error' then immediately 'close' — log here,
      // reconnection is handled in the 'close' listener above.
      console.error(`[WS] Socket error — backend may not be running at ${WS_URL}`);
    });
  }, []);

  // ── Mount / unmount ────────────────────────────────────────
  useEffect(() => {
    connect();
    return () => {
      if (retryTimeout.current) clearTimeout(retryTimeout.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Submit a review request ────────────────────────────────
  const submitReview = useCallback(
    (code: string, language: SupportedLanguage, filename?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setErrorMsg(
          `Not connected to backend (${WS_URL}). ` +
          "Check the backend terminal and try refreshing."
        );
        setStatus("error");
        return;
      }

      isReviewing.current = true;
      setStatus("streaming");
      setRawStream("");
      setReview(null);
      setErrorMsg(null);

      const payload = JSON.stringify({
        sessionId: uuidv4(),
        code,
        language,
        filename,
        createdAt: new Date().toISOString(),
      });

      console.log("[WS] Sending review request for language:", language);
      wsRef.current.send(payload);
    },
    [],
  );

  // ── Reset ─────────────────────────────────────────────────
  const reset = useCallback(() => {
    isReviewing.current = false;
    setStatus("idle");
    setRawStream("");
    setReview(null);
    setErrorMsg(null);
    setSessionId(null);
  }, []);

  return { status, connected, rawStream, review, errorMsg, sessionId, submitReview, reset };
}
