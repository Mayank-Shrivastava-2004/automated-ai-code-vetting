/**
 * App.tsx — Root component with Error Boundary
 *
 * Wraps the entire app in a React Error Boundary so any uncaught render
 * error shows a friendly recovery UI instead of a blank white screen.
 */

import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Header }         from "./components/Header/Header";
import { CodeEditor }     from "./components/Editor/CodeEditor";
import { ReviewPanel }    from "./components/ReviewPanel/ReviewPanel";
import { SessionSidebar } from "./components/Sidebar/SessionSidebar";
import { useWebSocket }   from "./hooks/useWebSocket";
import { useSessions }    from "./hooks/useSessions";
import type { ReviewSchema, SupportedLanguage } from "@shared/types";

// ── Error Boundary ────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }

class AppErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleReset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 16,
          background: "var(--bg-base)", color: "var(--text-primary)",
          fontFamily: "var(--font-sans)", textAlign: "center", padding: 32,
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ color: "var(--text-secondary)", maxWidth: 400, lineHeight: 1.7 }}>
            {this.state.message || "An unexpected render error occurred."}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#6366f1,#a855f7)",
              color: "#fff", fontWeight: 600, fontSize: 13,
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main App ──────────────────────────────────────────────────

function AppInner() {
  const ws       = useWebSocket();
  const sessions = useSessions();

  const [historicalReview, setHistoricalReview] = useState<ReviewSchema | null>(null);
  const [activeSessionId,  setActiveSessionId]  = useState<string | null>(null);

  // Refresh sidebar when a new review finishes
  const prevStatus = useRef(ws.status);
  useEffect(() => {
    if (prevStatus.current === "streaming" && ws.status === "complete") {
      void sessions.refresh();
      setActiveSessionId(ws.sessionId);
      setHistoricalReview(null);
    }
    prevStatus.current = ws.status;
  }, [ws.status, ws.sessionId, sessions]);

  // Load a historical review from the sidebar
  const handleSelectSession = useCallback(
    async (id: string) => {
      setActiveSessionId(id);
      const detail = await sessions.fetchDetail(id);
      if (detail) setHistoricalReview(detail.review);
    },
    [sessions],
  );

  // Submit a new review (clear history first)
  const handleSubmit = useCallback(
    (code: string, language: SupportedLanguage) => {
      setHistoricalReview(null);
      setActiveSessionId(null);
      ws.submitReview(code, language);
    },
    [ws],
  );

  const displayReview = historicalReview ?? ws.review;
  const displayStatus = historicalReview ? "complete" : ws.status;

  return (
    <div className="app-shell">
      <Header connected={ws.connected} status={ws.status} />

      <SessionSidebar
        sessions={sessions.sessions}
        loading={sessions.loading}
        activeId={activeSessionId}
        onSelect={handleSelectSession}
      />

      <CodeEditor onSubmit={handleSubmit} status={ws.status} />

      <ReviewPanel
        status={displayStatus}
        rawStream={ws.rawStream}
        review={displayReview}
        errorMsg={ws.errorMsg}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
