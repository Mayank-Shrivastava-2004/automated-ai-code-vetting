/**
 * services/aiClient.ts
 *
 * HTTP client that POSTs a review request to the Python AI service and
 * returns an async iterable of parsed ReviewChunk objects.
 *
 * The Python service responds with a `text/event-stream` (SSE) body.
 * We use the native Node.js `fetch` API (available since Node 18) to
 * consume that stream without any extra dependencies.
 *
 * Each yielded ReviewChunk can be directly forwarded to the WebSocket
 * client — the caller decides what to do with each chunk.
 */

import type { ReviewChunk, ReviewRequest } from "../../../types/index";

const AI_SERVICE_URL =
  process.env["AI_SERVICE_URL"] ?? "http://localhost:8001";

/**
 * Sends a review request to the AI service and yields ReviewChunk
 * objects one at a time as SSE frames arrive.
 *
 * @throws Will throw if the HTTP request itself fails (network error,
 *         non-2xx status).  Individual AI errors are yielded as
 *         ReviewChunk objects with `type === "error"` instead.
 */
export async function* streamFromAiService(
  request: ReviewRequest
): AsyncGenerator<ReviewChunk> {
  const response = await fetch(`${AI_SERVICE_URL}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `AI service returned HTTP ${response.status}: ${text}`
    );
  }

  if (!response.body) {
    throw new Error("AI service returned an empty response body.");
  }

  // ── Parse the SSE stream ──────────────────────────────────
  //
  // SSE frames look like:
  //   data: {"sessionId":"...","type":"partial","raw":"{"}\n\n
  //
  // We accumulate bytes into a buffer, split on double-newlines, and
  // parse the `data:` lines.

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  for await (const rawChunk of iterateBody(response.body)) {
    buffer += decoder.decode(rawChunk, { stream: true });

    // SSE events are separated by a blank line (\n\n)
    const events = buffer.split("\n\n");

    // The last element is an incomplete event — keep it for next iteration
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event
        .split("\n")
        .find((l) => l.startsWith("data:"));

      if (!line) continue;

      const jsonText = line.slice("data:".length).trim();
      if (!jsonText || jsonText === "[DONE]") continue;

      try {
        const chunk = JSON.parse(jsonText) as ReviewChunk;
        yield chunk;
      } catch {
        // Malformed frame — skip silently; the AI service is responsible
        // for sending well-formed JSON.
        console.warn("[aiClient] Skipped malformed SSE frame:", jsonText);
      }
    }
  }
}

/**
 * Bridges the WHATWG ReadableStream<Uint8Array> to an async iterable
 * that the `for await...of` loop can consume.
 */
async function* iterateBody(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
