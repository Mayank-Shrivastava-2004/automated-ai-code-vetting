"""
prompt.py — Builds the structured prompt that forces the LLM into JSON mode.

Strategy
--------
We use a two-message conversation:
  1. system  – defines the expert persona and mandates ONLY valid JSON output
  2. user    – supplies the code and language, echoes the required schema

This makes the LLM output trivially parseable and avoids markdown fences,
prose wrapping, or any other formatting noise.
"""

from __future__ import annotations

SYSTEM_PROMPT = """\
You are an expert senior software engineer specialising in code review.
Your ONLY job is to return a single, valid JSON object — no markdown, no prose,
no code fences. Do not include any text before or after the JSON.

The JSON must strictly follow this schema:

{
  "bugs": [
    {
      "line": <integer, 0-indexed>,
      "message": "<string>",
      "suggestion": "<string>",
      "severity": "<low|medium|high|critical>"
    }
  ],
  "style": [ /* same structure */ ],
  "security": [ /* same structure */ ],
  "summary": "<one paragraph plain English summary>",
  "score": <integer 0-100>
}

Rules:
- "bugs"     → logic errors, runtime exceptions, incorrect behaviour
- "style"    → readability, naming, formatting, best-practice violations
- "security" → auth flaws, injections, data-exposure, unsafe operations
- "score"    → overall code quality (0 = unacceptable, 100 = production-ready)
- If a category has no issues, return an empty array [].
- line numbers must be 0-indexed integers matching the submitted code.
- Never hallucinate issues that are not present in the code.
- Be concise but precise in "message" and "suggestion".
"""


def build_user_prompt(code: str, language: str, filename: str | None) -> str:
    """
    Construct the user turn of the prompt.

    Parameters
    ----------
    code:       Raw source code submitted by the user
    language:   Programming language (e.g. "python", "typescript")
    filename:   Optional filename for additional context
    """
    header_parts = [f"Language: {language}"]
    if filename:
        header_parts.append(f"Filename: {filename}")

    header = "\n".join(header_parts)

    return (
        f"{header}\n\n"
        f"Please review the following code and return ONLY the JSON object:\n\n"
        f"```{language}\n{code}\n```"
    )
