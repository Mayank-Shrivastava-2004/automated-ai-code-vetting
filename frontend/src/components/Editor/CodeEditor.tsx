import { useCallback, useRef, useState } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import type { SupportedLanguage } from "@shared/types";
import {
  detectFromContent,
  detectFromMonaco,
  LANGUAGE_LABELS,
} from "../../lib/languageDetect";
import type { ReviewStatus } from "../../hooks/useWebSocket";

interface CodeEditorProps {
  onSubmit: (code: string, language: SupportedLanguage) => void;
  status: ReviewStatus;
}

const DEFAULT_CODE = `// Paste or type your code here
// The language will be auto-detected as you type

function fetchUser(id) {
  const query = "SELECT * FROM users WHERE id = " + id;
  return db.execute(query);
}
`;

export function CodeEditor({ onSubmit, status }: CodeEditorProps) {
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const [language, setLanguage] = useState<SupportedLanguage>("javascript");
  const [monacoLang, setMonacoLang] = useState("javascript");

  const isStreaming = status === "streaming";

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Update language badge whenever the editor's language model changes
    editor.onDidChangeModelLanguage((e) => {
      const lang = detectFromMonaco(e.newLanguage);
      setLanguage(lang);
      setMonacoLang(e.newLanguage);
    });

    // Initial detection from default content
    const model = editor.getModel();
    if (model) {
      const detected = detectFromContent(model.getValue());
      setLanguage(detected);
      monaco.editor.setModelLanguage(model, detected === "unknown" ? "plaintext" : detected);
      setMonacoLang(detected === "unknown" ? "plaintext" : detected);
    }
  }, []);

  // Re-detect language from content heuristic when user stops typing
  const handleContentChange = useCallback((value: string | undefined) => {
    if (!value) return;
    // Only auto-detect if Monaco hasn't locked onto a specific language
    if (monacoLang === "plaintext" || monacoLang === "javascript") {
      const detected = detectFromContent(value);
      if (detected !== "unknown" && detected !== language) {
        setLanguage(detected);
        const model = editorRef.current?.getModel();
        if (model) {
          // Dynamically import monaco to call setModelLanguage
          import("monaco-editor").then(({ editor }) => {
            editor.setModelLanguage(model, detected);
          });
          setMonacoLang(detected);
        }
      }
    }
  }, [language, monacoLang]);

  const handleSubmit = useCallback(() => {
    const code = editorRef.current?.getValue() ?? "";
    if (!code.trim()) return;
    onSubmit(code, language);
  }, [language, onSubmit]);

  return (
    <section className="editor-pane" aria-label="Code editor">
      <div className="editor-toolbar">
        <div className="editor-toolbar__left">
          <div
            className="lang-badge"
            id="lang-badge"
            aria-label={`Detected language: ${LANGUAGE_LABELS[language]}`}
            title="Auto-detected language"
          >
            <span className="lang-badge__dot" aria-hidden="true" />
            {LANGUAGE_LABELS[language]}
          </div>
        </div>

        <button
          id="btn-review"
          className="btn-review"
          onClick={handleSubmit}
          disabled={isStreaming}
          aria-busy={isStreaming}
          aria-label={isStreaming ? "Review in progress" : "Start AI code review"}
        >
          {isStreaming ? (
            <>
              <span className="btn-review__spinner" aria-hidden="true" />
              Reviewing…
            </>
          ) : (
            <>
              <span aria-hidden="true">⚡</span>
              Review Code
            </>
          )}
        </button>
      </div>

      <div className="monaco-wrapper" role="main">
        <MonacoEditor
          height="100%"
          defaultLanguage="javascript"
          defaultValue={DEFAULT_CODE}
          theme="vs-dark"
          onMount={handleMount}
          onChange={handleContentChange}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            renderLineHighlight: "gutter",
            smoothScrolling: true,
            cursorBlinking: "phase",
            padding: { top: 12, bottom: 12 },
            readOnly: isStreaming === true,  // only lock editor during active review
            wordWrap: "on",
          }}
        />
      </div>
    </section>
  );
}
