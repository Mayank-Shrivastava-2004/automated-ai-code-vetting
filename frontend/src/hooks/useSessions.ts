/**
 * hooks/useSessions.ts
 *
 * Fetches and caches the list of past review sessions from the backend.
 * Also fetches a single session by ID for the "reload old review" feature.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReviewSchema } from "@shared/types";

export interface SessionSummary {
  session_id: string;
  language: string;
  filename: string | null;
  score: number;
  created_at: number;
}

export interface SessionDetail extends SessionSummary {
  code: string;
  review: ReviewSchema;
}

interface UseSessionsReturn {
  sessions: SessionSummary[];
  loading: boolean;
  refresh: () => void;
  fetchDetail: (id: string) => Promise<SessionDetail | null>;
}

export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading,  setLoading]  = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions?limit=50");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sessions: SessionSummary[] };
      setSessions(data.sessions ?? []);
    } catch (err) {
      console.error("[useSessions] Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fetchDetail = useCallback(
    async (id: string): Promise<SessionDetail | null> => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
        if (!res.ok) return null;
        return (await res.json()) as SessionDetail;
      } catch {
        return null;
      }
    },
    [],
  );

  return { sessions, loading, refresh, fetchDetail };
}
