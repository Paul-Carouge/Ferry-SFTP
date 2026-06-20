"use client";

import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { xml } from "@codemirror/lang-xml";
import { rust } from "@codemirror/lang-rust";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

function langExtensions(filename: string): Extension[] {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
      return [javascript()];
    case "jsx":
      return [javascript({ jsx: true })];
    case "ts":
      return [javascript({ typescript: true })];
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "py":
    case "pyw":
      return [python()];
    case "css":
    case "scss":
    case "less":
      return [css()];
    case "html":
    case "htm":
      return [html()];
    case "json":
    case "jsonc":
      return [json()];
    case "md":
    case "mdx":
      return [markdown()];
    case "xml":
    case "svg":
      return [xml()];
    case "rs":
      return [rust()];
    default:
      return [];
  }
}

export function CodeMirrorEditor({
  filename,
  value,
  readOnly,
  onChange,
}: {
  filename: string;
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  const extensions: Extension[] = [
    ...langExtensions(filename),
    EditorView.lineWrapping,
    ...(readOnly ? [EditorView.editable.of(false)] : []),
  ];

  return (
    <CodeMirror
      value={value}
      theme={oneDark}
      extensions={extensions}
      onChange={onChange}
      height="100%"
      style={{ height: "100%", fontSize: "12px", fontFamily: "monospace" }}
    />
  );
}
