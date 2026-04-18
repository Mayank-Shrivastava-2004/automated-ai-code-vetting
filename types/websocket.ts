// ============================================================
// WebSocket / SSE message types — used by backend & frontend
// ============================================================

"use strict";

import type { ReviewSchema, SupportedLanguage } from "./review";

// ── Client → Server ──────────────────────────────────────────

/**
 * Sent by the client to initiate a code review.
 * Travels over the WebSocket connection (or as the HTTP POST body
 * when the client falls back to SSE).
 */
export interface ReviewRequest {
  /** Unique session identifier (UUID v4 recommended) */
  sessionId: string;
  /** Raw source code to be reviewed */
  code: string;
  /** Programming language of the submitted code */
  language: SupportedLanguage;
  /** Optional filename — shown in the UI and used for language inference */
  filename?: string;
  /** ISO-8601 timestamp of when the request was created on the client */
  createdAt: string;
}

// ── Server → Client ──────────────────────────────────────────

/** Discriminated-union tag for every server-sent message */
export type ChunkType =
  | "start"       // review has begun
  | "partial"     // streaming token / partial JSON
  | "complete"    // full ReviewSchema is ready
  | "error"       // something went wrong
  | "ping";       // keep-alive heartbeat

/**
 * A single SSE / WebSocket frame sent from the server to the client
 * while streaming the AI review.
 *
 * Only `complete` chunks will have a fully-populated `data` field;
 * `partial` chunks carry raw token text in `raw`.
 */
export interface ReviewChunk {
  /** Matches the `sessionId` from the originating ReviewRequest */
  sessionId: string;
  /** What kind of message this is */
  type: ChunkType;
  /**
   * Present only when `type === "partial"`.
   * Contains the raw streamed token text from the LLM.
   */
  raw?: string;
  /**
   * Present only when `type === "complete"`.
   * The fully-parsed, validated review result.
   */
  data?: ReviewSchema;
  /**
   * Present only when `type === "error"`.
   * Human-readable error message safe to display in the UI.
   */
  error?: string;
  /** ISO-8601 server timestamp for this chunk */
  timestamp: string;
}

// ── Session tracking ─────────────────────────────────────────

/** Possible lifecycle states of a review session */
export type SessionStatus =
  | "idle"
  | "streaming"
  | "complete"
  | "error";

/**
 * Represents one active (or recently completed) review session.
 * Stored server-side and optionally synced to the client for
 * reconnection / hydration purposes.
 */
export interface SessionData {
  /** Unique session identifier (matches ReviewRequest.sessionId) */
  sessionId: string;
  /** Current lifecycle state */
  status: SessionStatus;
  /** The original request that created this session */
  request: ReviewRequest;
  /**
   * Incrementally accumulated chunks.
   * Allows the client to re-hydrate mid-stream if it reconnects.
   */
  chunks: ReviewChunk[];
  /**
   * The final result — populated once `status === "complete"`.
   * `null` until then.
   */
  result: ReviewSchema | null;
  /** ISO-8601 timestamp when the session was created */
  createdAt: string;
  /** ISO-8601 timestamp of the most recent update */
  updatedAt: string;
}
