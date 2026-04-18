// ============================================================
// Review Schema — shared across AI-service, backend & frontend
// ============================================================

"use strict";

/** Severity levels for individual review issues */
export type IssueSeverity = "low" | "medium" | "high" | "critical";

/** A single flagged issue returned by the AI */
export interface ReviewIssue {
  /** Zero-indexed line number where the issue starts */
  line: number;
  /** Short, human-readable description of the issue */
  message: string;
  /** Concrete suggestion for how to fix the problem */
  suggestion: string;
  /** How bad the problem is */
  severity: IssueSeverity;
}

/**
 * The full structured output produced by the AI service.
 * Maps 1-to-1 with the JSON the LLM is forced to return.
 */
export interface ReviewSchema {
  /** Logic errors, runtime exceptions, incorrect behaviour */
  bugs: ReviewIssue[];
  /** Readability, naming, formatting, best-practice violations */
  style: ReviewIssue[];
  /** Authentication, injection, data-exposure vulnerabilities */
  security: ReviewIssue[];
  /** One-paragraph plain-English overview of the code quality */
  summary: string;
  /**
   * Overall quality score.
   * Range: 0 – 100  (higher is better)
   */
  score: number;
}

/** Languages the AI service can accept */
export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "java"
  | "go"
  | "rust"
  | "cpp"
  | "csharp"
  | "php"
  | "ruby"
  | "unknown";
