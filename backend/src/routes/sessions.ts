/**
 * routes/sessions.ts
 *
 * Express router providing the history API:
 *
 *   GET /sessions            → paginated list of session summaries
 *   GET /sessions/:id        → full session detail (code + review)
 *
 * Both endpoints return JSON.  The review_json column is parsed before
 * sending so the client receives a proper ReviewSchema object, not a
 * raw string.
 */

import { Router, type Request, type Response } from "express";
import {
  listSessions,
  getSessionById,
  type SessionSummary,
  type SessionRow,
} from "../db/database";
import type { ReviewSchema } from "../../../types/index";

const router = Router();

// ── GET /sessions ─────────────────────────────────────────────

/**
 * Returns a paginated list of completed review sessions, newest first.
 *
 * Query params:
 *   limit   — max rows to return (default 20, max 100)
 *   offset  — pagination offset   (default 0)
 *
 * Response (200):
 *   {
 *     sessions: SessionSummary[],
 *     total: number,          // NOTE: omitted for now; add COUNT(*) if needed
 *     limit: number,
 *     offset: number
 *   }
 */
router.get("/", (req: Request, res: Response) => {
  const limit = Math.min(
    parseInt((req.query["limit"] as string) ?? "20", 10) || 20,
    100
  );
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10) || 0;

  const sessions: SessionSummary[] = listSessions(limit, offset);

  res.json({ sessions, limit, offset });
});

// ── GET /sessions/:id ─────────────────────────────────────────

/**
 * Returns the full detail of a single review session.
 *
 * Response (200):
 *   {
 *     session_id: string,
 *     language:   string,
 *     filename:   string | null,
 *     code:       string,
 *     review:     ReviewSchema,   ← parsed object, not raw JSON string
 *     score:      number,
 *     created_at: number
 *   }
 *
 * Response (404):
 *   { error: "Session not found" }
 */
router.get("/:id", (req: Request, res: Response) => {
  const row: SessionRow | undefined = getSessionById(req.params["id"] ?? "");

  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  let review: ReviewSchema;
  try {
    review = JSON.parse(row.review_json) as ReviewSchema;
  } catch {
    res.status(500).json({ error: "Stored review data is corrupted." });
    return;
  }

  res.json({
    session_id: row.session_id,
    language: row.language,
    filename: row.filename,
    code: row.code,
    review,
    score: row.score,
    created_at: row.created_at,
  });
});

export default router;
