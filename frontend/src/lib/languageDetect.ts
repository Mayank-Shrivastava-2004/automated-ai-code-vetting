/**
 * lib/languageDetect.ts
 *
 * Maps file extensions and content heuristics to a SupportedLanguage.
 * Used to auto-detect the language badge as the user types in the editor.
 */

import type { SupportedLanguage } from "@shared/types";

/** Extension → SupportedLanguage */
const EXT_MAP: Record<string, SupportedLanguage> = {
  ts:    "typescript",
  tsx:   "typescript",
  mts:   "typescript",
  js:    "javascript",
  jsx:   "javascript",
  mjs:   "javascript",
  cjs:   "javascript",
  py:    "python",
  pyw:   "python",
  java:  "java",
  go:    "go",
  rs:    "rust",
  cpp:   "cpp",
  cc:    "cpp",
  cxx:   "cpp",
  "c++": "cpp",
  cs:    "csharp",
  php:   "php",
  rb:    "ruby",
};

/** Monaco language id → SupportedLanguage */
const MONACO_MAP: Record<string, SupportedLanguage> = {
  typescript:  "typescript",
  javascript:  "javascript",
  python:      "python",
  java:        "java",
  go:          "go",
  rust:        "rust",
  cpp:         "cpp",
  csharp:      "csharp",
  php:         "php",
  ruby:        "ruby",
};

/**
 * Infer a SupportedLanguage from a filename string.
 * Falls back to "unknown" when the extension is not recognised.
 */
export function detectFromFilename(filename: string): SupportedLanguage {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "unknown";
}

/**
 * Convert a Monaco editor language id to a SupportedLanguage.
 */
export function detectFromMonaco(monacoLang: string): SupportedLanguage {
  return MONACO_MAP[monacoLang] ?? "unknown";
}

/**
 * Simple content heuristic — scan the first 500 chars of code for
 * well-known patterns to provide a fallback language guess.
 */
export function detectFromContent(code: string): SupportedLanguage {
  const sample = code.slice(0, 500);

  if (/^\s*(import|export)\s+.*(from\s+['"]|['"])/m.test(sample) &&
      /:\s*\w+(\[\])?[;,)>]/.test(sample)) return "typescript";
  if (/^\s*(import|export|const|let|var|function)\s+/m.test(sample)) return "javascript";
  if (/^\s*(def |import |from .+ import |class .+:)/m.test(sample)) return "python";
  if (/^\s*(public\s+class|import java\.|@Override)/m.test(sample)) return "java";
  if (/^\s*(package main|func |import \()/m.test(sample)) return "go";
  if (/^\s*(fn |use |let mut |impl |struct )/m.test(sample)) return "rust";
  if (/#include\s*</.test(sample)) return "cpp";
  if (/\bnamespace\b/.test(sample) && /\busing\b/.test(sample)) return "csharp";
  if (/<\?php/i.test(sample)) return "php";
  if (/^\s*(def |require |puts |attr_)/m.test(sample)) return "ruby";

  return "unknown";
}

/** Display label for a language badge */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  typescript:  "TypeScript",
  javascript:  "JavaScript",
  python:      "Python",
  java:        "Java",
  go:          "Go",
  rust:        "Rust",
  cpp:         "C++",
  csharp:      "C#",
  php:         "PHP",
  ruby:        "Ruby",
  unknown:     "Plain Text",
};
