/**
 * db/database.ts  (in-memory version)
 *
 * Replaces better-sqlite3 with a plain Map so the backend runs on any
 * machine without Visual Studio Build Tools / node-gyp.
 *
 * Trade-off: data is lost when the process restarts.
 * For an interview demo this is perfectly acceptable; swapping back to
 * SQLite later is a one-file change.
 */

import type { ReviewSchema } from "../../../types/index";

// ── Types (same public surface as the SQLite version) ─────────

export interface SessionRow {
  session_id: string;
  language: string;
  filename: string | null;
  code: string;
  review_json: string;   // JSON.stringify(ReviewSchema)
  score: number;
  created_at: number;    // Unix-epoch ms
}

export interface SessionSummary {
  session_id: string;
  language: string;
  filename: string | null;
  score: number;
  created_at: number;
}

// ── In-memory store ───────────────────────────────────────────

/** Insertion-ordered map keyed by session_id */
const store = new Map<string, SessionRow>();

// ── Repository functions ──────────────────────────────────────

/**
 * Persist a completed review.
 * Uses Map.set so duplicate sessionIds simply overwrite the previous row.
 */
export function saveSession(params: {
  session_id: string;
  language: string;
  filename: string | null;
  code: string;
  review: ReviewSchema;
}): void {
  store.set(params.session_id, {
    session_id:  params.session_id,
    language:    params.language,
    filename:    params.filename,
    code:        params.code,
    review_json: JSON.stringify(params.review),
    score:       params.review.score,
    created_at:  Date.now(),
  });
}

/**
 * Return sessions newest-first, with pagination.
 */
export function listSessions(limit = 50, offset = 0): SessionSummary[] {
  const all = [...store.values()]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(offset, offset + limit);

  return all.map(({ session_id, language, filename, score, created_at }) => ({
    session_id,
    language,
    filename,
    score,
    created_at,
  }));
}

/**
 * Fetch a single full session row by ID.
 * Returns `undefined` when not found.
 */
export function getSessionById(sessionId: string): SessionRow | undefined {
  return store.get(sessionId);
}

/**
 * No-op — kept so server.ts can call getDb() without changes.
 */
export function getDb(): void {
  // Nothing to initialise for the in-memory store.
}
