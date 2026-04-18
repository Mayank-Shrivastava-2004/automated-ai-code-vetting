"""
main.py — FastAPI application entry point for the AI Code Review service.

Endpoints
---------
POST /review        →  StreamingResponse (text/event-stream / SSE)
GET  /health        →  200 OK JSON liveness probe
GET  /              →  service info

Environment variables (see .env.example)
-----------------------------------------
OPENAI_API_KEY      required  Your OpenAI API key
OPENAI_MODEL        optional  Default: gpt-4o-mini
AI_SERVICE_PORT     optional  Default: 8001
ALLOWED_ORIGINS     optional  Comma-separated CORS origins
"""

from __future__ import annotations

import logging
import os
import asyncio
import json
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

from models import ReviewRequest
from reviewer import stream_review

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────
load_dotenv()

OPENAI_API_KEY: str = os.environ["OPENAI_API_KEY"]          # hard fail if missing
OPENAI_MODEL:   str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
AI_SERVICE_PORT:int = int(os.getenv("AI_SERVICE_PORT", "8001"))
_raw_origins        = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]


# ── Application lifecycle ─────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create a shared AsyncOpenAI client and tear it down on shutdown."""
    logger.info("Starting AI service — model=%s", OPENAI_MODEL)
    app.state.openai = AsyncOpenAI(api_key=OPENAI_API_KEY)
    yield
    await app.state.openai.close()
    logger.info("AI service shut down cleanly.")


# ── App factory ───────────────────────────────────────────────

app = FastAPI(
    title="AI Code Review Service",
    description=(
        "Accepts source code and returns a structured, streaming review "
        "categorised into bugs, style issues, and security vulnerabilities."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────

@app.get("/", tags=["meta"])
async def root():
    return {
        "service": "ai-code-review",
        "version": "1.0.0",
        "model": OPENAI_MODEL,
        "status": "running",
    }


@app.get("/health", tags=["meta"])
async def health():
    """Liveness probe — returns 200 if the service is up."""
    return {"status": "ok"}


async def mock_stream_review(session_id: str):
    mock_review = {
        "bugs": [
            {"line": 5, "message": "SQL Injection vulnerability due to string concatenation.", "suggestion": "Use parameterized queries.", "severity": "critical"}
        ],
        "style": [
            {"line": 1, "message": "Missing function docstring.", "suggestion": "Add a description for fetchUser.", "severity": "low"}
        ],
        "security": [
            {"line": 5, "message": "Raw input passed to database execution.", "suggestion": "Sanitize 'id' or use an ORM.", "severity": "high"}
        ],
        "summary": "This is a **MOCK** response. The code contains critical security flaws that must be addressed immediately.",
        "score": 45
    }

    mock_json_str = json.dumps(mock_review)
    
    # Send start
    yield f'data: {json.dumps({"sessionId": session_id, "type": "start", "timestamp": datetime.now(timezone.utc).isoformat()})}\\n\\n'
    await asyncio.sleep(0.1)

    # Stream out partial json array to simulate the live generation
    chunk_size = 5
    for i in range(0, len(mock_json_str), chunk_size):
        chunk = mock_json_str[i:i+chunk_size]
        payload = {
            "sessionId": session_id,
            "type": "partial",
            "raw": chunk,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        yield f"data: {json.dumps(payload)}\\n\\n"
        await asyncio.sleep(0.05)

    # Send complete payload
    payload = {
        "sessionId": session_id,
        "type": "complete",
        "data": mock_review,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    yield f"data: {json.dumps(payload)}\\n\\n"


@app.post("/review", tags=["review"])
async def review_code(body: ReviewRequest, request: Request):
    """
    Stream an AI code review as Server-Sent Events (SSE).

    The response is a ``text/event-stream`` where each frame is a JSON-
    serialised ``ReviewChunk``.  Clients should read frames until they
    receive a chunk with ``type == "complete"`` or ``type == "error"``.

    Example SSE frame (partial token):
        data: {"sessionId":"abc","type":"partial","raw":" {","timestamp":"..."}

    Example SSE frame (complete):
        data: {"sessionId":"abc","type":"complete","data":{...},"timestamp":"..."}
    """
    if not body.code.strip():
        raise HTTPException(status_code=422, detail="Code must not be empty.")

    client: AsyncOpenAI = request.app.state.openai

    generator = mock_stream_review(body.session_id)

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            # Prevent proxies / Nginx from buffering the SSE stream
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":       "keep-alive",
        },
    )


# ── Dev entry point ───────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=AI_SERVICE_PORT,
        reload=True,
        log_level="info",
    )
