"""
models.py — Pydantic models that mirror the shared TypeScript types.
These are used for request validation and response serialisation.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────

class IssueSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class SupportedLanguage(str, Enum):
    typescript  = "typescript"
    javascript  = "javascript"
    python      = "python"
    java        = "java"
    go          = "go"
    rust        = "rust"
    cpp         = "cpp"
    csharp      = "csharp"
    php         = "php"
    ruby        = "ruby"
    unknown     = "unknown"


class ChunkType(str, Enum):
    start    = "start"
    partial  = "partial"
    complete = "complete"
    error    = "error"
    ping     = "ping"


# ── Core domain models ────────────────────────────────────────

class ReviewIssue(BaseModel):
    """A single flagged issue — mirrors TypeScript ReviewIssue."""
    line: int = Field(..., ge=0, description="Zero-indexed source line number")
    message: str = Field(..., min_length=1)
    suggestion: str = Field(..., min_length=1)
    severity: IssueSeverity


class ReviewSchema(BaseModel):
    """
    The structured output the LLM is forced to produce.
    Mirrors the TypeScript ReviewSchema interface exactly.
    """
    bugs: list[ReviewIssue] = Field(default_factory=list)
    style: list[ReviewIssue] = Field(default_factory=list)
    security: list[ReviewIssue] = Field(default_factory=list)
    summary: str = Field(..., min_length=1)
    score: int = Field(..., ge=0, le=100)


# ── HTTP request / response ───────────────────────────────────

class ReviewRequest(BaseModel):
    """Incoming POST /review body — mirrors TypeScript ReviewRequest."""
    session_id: str = Field(..., alias="sessionId")
    code: str = Field(..., min_length=1)
    language: SupportedLanguage
    filename: Optional[str] = None
    created_at: str = Field(..., alias="createdAt")

    model_config = {"populate_by_name": True}


# ── SSE frame ────────────────────────────────────────────────

class ReviewChunk(BaseModel):
    """A single SSE frame — mirrors TypeScript ReviewChunk."""
    session_id: str = Field(..., alias="sessionId")
    type: ChunkType
    raw: Optional[str] = None
    data: Optional[ReviewSchema] = None
    error: Optional[str] = None
    timestamp: str  # ISO-8601

    model_config = {"populate_by_name": True}
