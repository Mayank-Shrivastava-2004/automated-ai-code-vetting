/**
 * components/ReviewPanel/ReviewPanel.tsx
 *
 * Right pane — renders the AI review in real-time:
 *   - Idle:      placeholder illustration
 *   - Streaming: animated raw token stream + blinking cursor
 *   - Complete:  score ring, summary, categorised issues
 *   - Error:     error banner with retry hint
 */

import type { ReviewIssue, ReviewSchema } from "@shared/types";
import type { ReviewStatus } from "../../hooks/useWebSocket";

// ── Sub-components ────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const R = 28;
  const circumference = 2 * Math.PI * R;
  const offset = circumference - (score / 100) * circumference;
  const colour =
    score >= 80 ? "var(--accent-green)" :
    score >= 50 ? "var(--accent-yellow)" :
                  "var(--accent-red)";

  return (
    <div className="score-ring" aria-label={`Quality score: ${score} out of 100`}>
      <svg viewBox="0 0 72 72" width="72" height="72">
        <circle
          className="score-ring__track"
          cx="36" cy="36" r={R}
          strokeWidth="5"
        />
        <circle
          className="score-ring__fill"
          cx="36" cy="36" r={R}
          strokeWidth="5"
          stroke={colour}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-ring__label" style={{ color: colour }}>
        {score}
        <span className="score-ring__sub">/ 100</span>
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: ReviewIssue }) {
  return (
    <article
      className={`issue-card issue-card--${issue.severity}`}
      aria-label={`${issue.severity} severity issue at line ${issue.line + 1}`}
    >
      <div className="issue-card__top">
        <span className="issue-card__line">L{issue.line + 1}</span>
        <span className={`issue-card__severity issue-card__severity--${issue.severity}`}>
          {issue.severity}
        </span>
      </div>
      <p className="issue-card__message">{issue.message}</p>
      <p className="issue-card__suggestion">{issue.suggestion}</p>
    </article>
  );
}

interface IssueSectionProps {
  title: string;
  icon: string;
  issues: ReviewIssue[];
  colour: string;
}

function IssueSection({ title, icon, issues, colour }: IssueSectionProps) {
  return (
    <section className="issue-section" aria-label={`${title} issues`}>
      <h3 className="issue-section__title" style={{ color: colour }}>
        <span className="issue-section__icon" aria-hidden="true">{icon}</span>
        {title}
        <span className="issue-section__count">{issues.length}</span>
      </h3>
      {issues.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0" }}>
          No {title.toLowerCase()} issues found ✓
        </p>
      ) : (
        issues.map((issue, i) => <IssueCard key={i} issue={issue} />)
      )}
    </section>
  );
}

function CompleteReview({ review }: { review: ReviewSchema }) {
  return (
    <>
      <div className="score-card" role="region" aria-label="Review score and summary">
        <ScoreRing score={review.score} />
        <p className="score-card__summary">{review.summary}</p>
      </div>

      <IssueSection
        title="Security"
        icon="🔒"
        issues={review.security}
        colour="var(--accent-red)"
      />
      <IssueSection
        title="Bugs"
        icon="🐛"
        issues={review.bugs}
        colour="var(--accent-yellow)"
      />
      <IssueSection
        title="Style"
        icon="✨"
        issues={review.style}
        colour="var(--accent-blue)"
      />
    </>
  );
}

// ── Main component ────────────────────────────────────────────

interface ReviewPanelProps {
  status: ReviewStatus;
  rawStream: string;
  review: ReviewSchema | null;
  errorMsg: string | null;
}

export function ReviewPanel({
  status,
  rawStream,
  review,
  errorMsg,
}: ReviewPanelProps) {
  return (
    <aside className="review-pane" aria-label="AI review results">
      {/* ── Toolbar ── */}
      <div className="review-pane__header" role="heading" aria-level={2}>
        <span>AI Review</span>
        {status === "streaming" && (
          <span className="reviewing-badge" aria-live="polite">
            <span aria-hidden="true">⚡</span>
            Analysing
            <span className="reviewing-badge__cursor" aria-hidden="true" />
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div className="review-pane__body" role="region" aria-label="Review content">

        {/* Idle */}
        {status === "idle" && (
          <div className="idle-state" aria-label="No review yet">
            <div className="idle-state__icon" aria-hidden="true">🔍</div>
            <p className="idle-state__title">Ready to review</p>
            <p className="idle-state__sub">
              Paste your code in the editor and click{" "}
              <strong style={{ color: "var(--brand)" }}>Review Code</strong>{" "}
              to get instant AI feedback on bugs, style, and security.
            </p>
          </div>
        )}

        {/* Streaming — show live token stream */}
        {status === "streaming" && (
          <>
            <div className="stream-preview__label">Live output</div>
            <pre
              className="stream-preview"
              aria-live="polite"
              aria-label="Streaming AI response"
            >
              {rawStream}
              <span className="reviewing-badge__cursor" aria-hidden="true" />
            </pre>
          </>
        )}

        {/* Complete */}
        {status === "complete" && review && (
          <CompleteReview review={review} />
        )}

        {/* Error */}
        {status === "error" && (
          <div
            className="error-banner"
            role="alert"
            aria-live="assertive"
          >
            ⚠️ {errorMsg ?? "Something went wrong. Please try again."}
          </div>
        )}
      </div>
    </aside>
  );
}
