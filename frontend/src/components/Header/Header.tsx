/**
 * components/Header/Header.tsx
 */

import type { ReviewStatus } from "../../hooks/useWebSocket";

interface HeaderProps {
  connected: boolean;
  status: ReviewStatus;
}

export function Header({ connected, status }: HeaderProps) {
  const statusLabel =
    status === "streaming" ? "Reviewing…" :
    status === "complete"  ? "Review complete" :
    status === "error"     ? "Error" :
    connected              ? "Connected" : "Disconnected";

  return (
    <header className="header" role="banner">
      <div className="header__logo">
        <div className="header__logo-icon" aria-hidden="true">⚡</div>
        <span>CodeReview <span style={{ color: "var(--brand)" }}>AI</span></span>
      </div>

      <div className="header__status" aria-live="polite" aria-label={`Connection status: ${statusLabel}`}>
        <span
          className={`header__dot ${connected ? "header__dot--connected" : ""}`}
          aria-hidden="true"
        />
        <span>{statusLabel}</span>
      </div>
    </header>
  );
}
