"""
reviewer.py — Core AI reviewer logic.

Uses the OpenAI streaming API to get tokens as they arrive, then yields
SSE-formatted ReviewChunk frames so FastAPI can stream them directly to
the client without buffering the full response.

Supports both streaming (token-by-token) and non-streaming fallback.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import AsyncIterator

from openai import AsyncOpenAI
from pydantic import ValidationError

from models import ChunkType, ReviewChunk, ReviewSchema
from prompt import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    """Return current UTC time as ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _chunk_to_sse(chunk: ReviewChunk) -> str:
    """
    Serialise a ReviewChunk as an SSE frame.

    Format:
        data: <json>\\n\\n
    """
    payload = chunk.model_dump(by_alias=True, exclude_none=True)
    return f"data: {json.dumps(payload)}\n\n"


async def stream_review(
    *,
    client: AsyncOpenAI,
    session_id: str,
    code: str,
    language: str,
    filename: str | None,
    model: str = "gpt-4o-mini",
) -> AsyncIterator[str]:
    """
    Core streaming coroutine.

    Yields SSE-formatted strings (data: ...\\n\\n) so that FastAPI's
    StreamingResponse can forward them directly to the browser.

    Flow
    ----
    1.  Yield a ``start`` chunk to signal the review has begun.
    2.  Open an OpenAI streaming chat completion.
    3.  For every token received, yield a ``partial`` chunk containing
        the raw text so the client can show a live "thinking" animation.
    4.  Once the stream ends, assemble the full text and parse it as
        ReviewSchema (JSON mode guarantees valid JSON from the model).
    5.  Yield a ``complete`` chunk with the validated ReviewSchema.
    6.  On any error, yield an ``error`` chunk instead of raising.
    """

    # ── 1. Start signal ──────────────────────────────────────
    yield _chunk_to_sse(ReviewChunk(
        sessionId=session_id,
        type=ChunkType.start,
        timestamp=_now_iso(),
    ))

    accumulated_text = ""

    try:
        user_prompt = build_user_prompt(code, language, filename)

        # ── 2. Open streaming completion ──────────────────────
        stream = await client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},   # JSON mode
            stream=True,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.2,   # low temp → deterministic structured output
            max_tokens=2048,
        )

        # ── 3. Stream partial tokens ──────────────────────────
        async for event in stream:
            delta = event.choices[0].delta
            token = delta.content or ""
            if token:
                accumulated_text += token
                yield _chunk_to_sse(ReviewChunk(
                    sessionId=session_id,
                    type=ChunkType.partial,
                    raw=token,
                    timestamp=_now_iso(),
                ))

        # ── 4. Parse the complete JSON ────────────────────────
        review = ReviewSchema.model_validate_json(accumulated_text)

        # ── 5. Complete signal ────────────────────────────────
        yield _chunk_to_sse(ReviewChunk(
            sessionId=session_id,
            type=ChunkType.complete,
            data=review,
            timestamp=_now_iso(),
        ))

    except ValidationError as exc:
        logger.error("ReviewSchema validation failed: %s", exc)
        yield _chunk_to_sse(ReviewChunk(
            sessionId=session_id,
            type=ChunkType.error,
            error="The AI returned a malformed response. Please try again.",
            timestamp=_now_iso(),
        ))

    except json.JSONDecodeError as exc:
        logger.error("JSON parse error: %s | raw=%r", exc, accumulated_text)
        yield _chunk_to_sse(ReviewChunk(
            sessionId=session_id,
            type=ChunkType.error,
            error="Failed to parse the AI response as JSON.",
            timestamp=_now_iso(),
        ))

    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error during streaming review: %s", exc)
        yield _chunk_to_sse(ReviewChunk(
            sessionId=session_id,
            type=ChunkType.error,
            error="An unexpected error occurred. Please try again later.",
            timestamp=_now_iso(),
        ))
