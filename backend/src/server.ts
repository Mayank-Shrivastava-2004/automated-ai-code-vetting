
import "dotenv/config";
import http          from "http";
import express       from "express";
import cors          from "cors";
import { WebSocket, WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";


const PORT           = parseInt(process.env["PORT"]           ?? "3001",                10);
const AI_SERVICE_URL =             process.env["AI_SERVICE_URL"] ?? "http://localhost:8001";
const FRONTEND_ORIGIN =            process.env["FRONTEND_ORIGIN"] ?? "http://localhost:5173";

console.log(`[config] PORT=${PORT}  AI_SERVICE_URL=${AI_SERVICE_URL}  FRONTEND=${FRONTEND_ORIGIN}`);


interface ReviewIssue {
  line: number;
  message: string;
  suggestion: string;
  severity: "low" | "medium" | "high" | "critical";
}
interface ReviewSchema {
  bugs: ReviewIssue[];
  style: ReviewIssue[];
  security: ReviewIssue[];
  summary: string;
  score: number;
}
interface ReviewRequest {
  sessionId: string;
  code: string;
  language: string;
  filename?: string;
  createdAt: string;
}
interface ReviewChunk {
  sessionId: string;
  type: "start" | "partial" | "complete" | "error" | "ping";
  raw?: string;
  data?: ReviewSchema;
  error?: string;
  timestamp: string;
}


interface SessionRow {
  session_id: string;
  language:   string;
  filename:   string | null;
  code:       string;
  review:     ReviewSchema;
  score:      number;
  created_at: number;
}

const sessionStore = new Map<string, SessionRow>();

function saveSession(row: Omit<SessionRow, "created_at">): void {
  sessionStore.set(row.session_id, { ...row, created_at: Date.now() });
}
function listSessions(limit = 50, offset = 0) {
  return [...sessionStore.values()]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(offset, offset + limit)
    .map(({ session_id, language, filename, score, created_at }) =>
      ({ session_id, language, filename, score, created_at }));
}
function getSessionById(id: string): SessionRow | undefined {
  return sessionStore.get(id);
}


function nowIso(): string { return new Date().toISOString(); }

function sendChunk(ws: WebSocket, chunk: ReviewChunk): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(chunk));
  }
}


const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function* streamFromAiService(
  request: ReviewRequest,
): AsyncGenerator<ReviewChunk> {
  console.log(`[ws] Generating hardcoded MOCK stream for session ${request.sessionId}`);
  
  const mockReview: ReviewSchema = {
    bugs: [
      { line: 5, message: "SQL Injection vulnerability due to string concatenation.", suggestion: "Use parameterized queries.", severity: "critical" }
    ],
    style: [
      { line: 3, message: "Prefer 'const' over 'let' for variables that are never mutated.", suggestion: "Change 'let query' to 'const query'.", severity: "low" }
    ],
    security: [
      { line: 2, message: "Hardcoded database credentials detected in scope.", suggestion: "Move credentials to injected environment variables.", severity: "high" }
    ],
    summary: "This is a streaming **MOCK** response directly from the Node.js backend, completely bypassing Python and Port 8001.",
    score: 42
  };

  const mockJsonStr = JSON.stringify(mockReview);
  
  // 1. Send start chunk
  yield { sessionId: request.sessionId, type: "start", timestamp: nowIso() };
  await delay(100);

  // 2. Stream out partial json string in small chunks
  const chunkSize = 4;
  for (let i = 0; i < mockJsonStr.length; i += chunkSize) {
    const chunk = mockJsonStr.slice(i, i + chunkSize);
    yield {
      sessionId: request.sessionId,
      type: "partial",
      raw: chunk,
      timestamp: nowIso()
    };
    await delay(50); // Simulate network/LLM latency
  }

  // 3. Send complete chunk
  yield {
    sessionId: request.sessionId,
    type: "complete",
    data: mockReview,
    timestamp: nowIso()
  };
}

// ── WebSocket connection handler ───────────────────────────────

function handleWsConnection(ws: WebSocket): void {
  const sessionId = uuidv4();
  let   isStreaming = false;

  console.log(`[ws] Client connected → session ${sessionId}`);

  // Handshake: announce session ID
  sendChunk(ws, { sessionId, type: "start", timestamp: nowIso() });

  ws.on("message", (raw) => {
    void (async () => {
      if (isStreaming) {
        sendChunk(ws, { sessionId, type: "error",
          error: "A review is already in progress.", timestamp: nowIso() });
        return;
      }

      let request: ReviewRequest;
      try {
        request = JSON.parse(raw.toString()) as ReviewRequest;
        if (!request.code?.trim())     throw new Error("code is required");
        if (!request.language?.trim()) throw new Error("language is required");
      } catch (err) {
        sendChunk(ws, { sessionId, type: "error",
          error: `Invalid request: ${(err as Error).message}`, timestamp: nowIso() });
        return;
      }

      // Stamp the server session ID
      const reviewReq: ReviewRequest = {
        ...request, sessionId, createdAt: request.createdAt ?? nowIso(),
      };

      isStreaming = true;
      console.log(`[ws] Starting review ${sessionId} language=${reviewReq.language}`);

      try {
        for await (const chunk of streamFromAiService(reviewReq)) {
          sendChunk(ws, chunk);

          if (chunk.type === "complete" && chunk.data) {
            saveSession({
              session_id: sessionId,
              language:   reviewReq.language,
              filename:   reviewReq.filename ?? null,
              code:       reviewReq.code,
              review:     chunk.data,
              score:      chunk.data.score,
            });
            console.log(`[ws] Saved session ${sessionId} score=${chunk.data.score}`);
          }
          if (chunk.type === "complete" || chunk.type === "error") break;
        }
      } catch (err) {
        console.error(`[ws] Stream error for ${sessionId}:`, err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendChunk(ws, { sessionId, type: "error",
          error: `Communication error with AI service (Port 8001): ${errorMessage}`,
          timestamp: nowIso() });
      } finally {
        isStreaming = false;
      }
    })();
  });

  ws.on("close", (code) => console.log(`[ws] Session ${sessionId} closed (${code})`));
  ws.on("error", (err)  => console.error(`[ws] Session ${sessionId} error:`, err));
}

// ── Express REST API ───────────────────────────────────────────

const app = express();

app.use(cors({
  origin: [FRONTEND_ORIGIN, "http://localhost:3000"],
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", sessions: sessionStore.size, ts: nowIso() });
});

app.get("/api/sessions", (req, res) => {
  const limit  = Math.min(parseInt((req.query["limit"]  as string) ?? "20", 10) || 20, 100);
  const offset = parseInt((req.query["offset"] as string) ?? "0", 10) || 0;
  res.json({ sessions: listSessions(limit, offset), limit, offset });
});

app.get("/api/sessions/:id", (req, res) => {
  const row = getSessionById(req.params["id"] ?? "");
  if (!row) { res.status(404).json({ error: "Session not found" }); return; }
  res.json({
    session_id: row.session_id, language: row.language,
    filename: row.filename, code: row.code, review: row.review,
    score: row.score, created_at: row.created_at,
  });
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ── HTTP + WebSocket server ────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({ server });
wss.on("connection", handleWsConnection);
wss.on("error",      (err) => console.error("[wss] Server error:", err));

server.listen(PORT, () => {
  console.log(`[server] HTTP  → http://localhost:${PORT}`);
  console.log(`[server] WS    → ws://localhost:${PORT}`);
  console.log(`[server] REST  → http://localhost:${PORT}/api/sessions`);
});

// ── Graceful shutdown ──────────────────────────────────────────

function shutdown(sig: string) {
  console.log(`\n[server] ${sig} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
