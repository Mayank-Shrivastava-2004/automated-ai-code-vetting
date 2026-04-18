/**
 * components/Sidebar/SessionSidebar.tsx
 *
 * Left sidebar listing past review sessions.
 *
 * Features:
 *  - Language badge per session
 *  - Relative date (Today, Yesterday, or MM/DD)
 *  - Score colour (green ≥ 80, yellow ≥ 50, red < 50)
 *  - Click to reload a historical review into the panel
 */

import type { SessionSummary } from "../../hooks/useSessions";
import { LANGUAGE_LABELS } from "../../lib/languageDetect";
import type { SupportedLanguage } from "@shared/types";

interface SessionSidebarProps {
  sessions: SessionSummary[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
}

function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function scoreClass(score: number): string {
  if (score >= 80) return "";              // default green
  if (score >= 50) return "session-item__score--mid";
  return "session-item__score--low";
}

export function SessionSidebar({
  sessions,
  loading,
  activeId,
  onSelect,
}: SessionSidebarProps) {
  return (
    <nav className="sidebar" aria-label="Past review sessions">
      <div className="sidebar__header">History</div>

      <div className="sidebar__list" role="list">
        {loading && sessions.length === 0 && (
          <p className="sidebar__empty">Loading sessions…</p>
        )}

        {!loading && sessions.length === 0 && (
          <p className="sidebar__empty">
            No reviews yet.<br />
            Submit your first review to see history here.
          </p>
        )}

        {sessions.map((s) => {
          const label = LANGUAGE_LABELS[s.language as SupportedLanguage] ?? s.language;
          const isActive = s.session_id === activeId;

          return (
            <div
              key={s.session_id}
              role="listitem"
              className={`session-item ${isActive ? "session-item--active" : ""}`}
              onClick={() => onSelect(s.session_id)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(s.session_id)}
              tabIndex={0}
              aria-current={isActive ? "true" : undefined}
              aria-label={`${label} review, score ${s.score}, ${formatDate(s.created_at)}`}
            >
              <div className="session-item__top">
                <span className="session-item__lang">{label}</span>
                <span className={`session-item__score ${scoreClass(s.score)}`}>
                  {s.score}
                </span>
              </div>
              <div className="session-item__date">
                {s.filename ? `${s.filename} · ` : ""}{formatDate(s.created_at)}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
