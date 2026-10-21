// Shared CodeMirror 6 wrapper — replaces the Monaco <Editor> component.
// Consumers pass language/completion extensions; Mod-Enter fires onRun and the
// EditorView is exposed via viewRef for selection reads and diagnostics.
import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState, Prec, Compartment, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import {
  closeBrackets,
  autocompletion,
  closeCompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { useStore } from '@tanstack/react-store';
import { appStore } from '@/store';

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  '.cm-content': { paddingTop: '8px' },
});

export type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** Language/completion/lint extensions provided by the caller. */
  extensions?: Extension[];
  /** Fires on Ctrl/Cmd+Enter (the run-query keybinding). */
  onRun?: () => void;
  /** Receives the EditorView once mounted (null on unmount). */
  viewRef?: React.MutableRefObject<EditorView | null>;
  showLineNumbers?: boolean;
};

export function CodeEditor({
  value,
  onChange,
  extensions = [],
  onRun,
  viewRef,
  showLineNumbers = true,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewHandleRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const externalRef = useRef(viewRef);
  externalRef.current = viewRef;

  const appTheme = useStore(appStore, (s) => s.theme);
  const isDark =
    appTheme === 'dark' ||
    (appTheme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const themeCompartmentRef = useRef(new Compartment());

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const runKeymap = Prec.highest(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: (targetView) => {
            closeCompletion(targetView);
            onRunRef.current?.();
            return true;
          },
        },
      ]),
    );

    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged) onChangeRef.current(update.state.doc.toString());
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          closeBrackets(),
          showLineNumbers ? lineNumbers() : [],
          // completionKeymap handles Escape to close completion popup without propagating to global cancel handlers. (Why)
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          themeCompartmentRef.current.of(isDark ? oneDark : []),
          editorTheme,
          runKeymap,
          listener,
          extensions,
        ],
      }),
      parent: host,
    });
    viewHandleRef.current = view;
    if (externalRef.current) externalRef.current.current = view;
    return () => {
      view.destroy();
      viewHandleRef.current = null;
      if (externalRef.current) externalRef.current.current = null;
    };
    // Editor is created once per mount; extension set is static per consumer.
  }, []);

  // Dynamically reconfigure the theme compartment when light/dark theme switches. (How / Why / What)
  useEffect(() => {
    const view = viewHandleRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(isDark ? oneDark : []),
    });
  }, [isDark]);

  // External value updates (history select, tab restore) push into the doc.
  useEffect(() => {
    const view = viewHandleRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" />;
}

// ── Schema-completion adapter ────────────────────────────────────────────
// Maps the editor-agnostic CompletionEntry lists produced by
// lib/sql-autocomplete.ts / lib/mongo-autocomplete.ts onto CodeMirror's
// CompletionResult so each editor registers a one-line completion source.

export type SchemaCompletionEntry = {
  label: string;
  insertText: string;
  detail?: string;
  kind: string;
  sortText?: string;
};

const CM_TYPE: Record<string, string> = {
  table: 'class',
  collection: 'class',
  column: 'property',
  field: 'property',
  function: 'function',
  stage: 'function',
  operator: 'keyword',
  accumulator: 'function',
  expression: 'variable',
  keyword: 'keyword',
};

/** Builds a completion source. `getTextUntil(ctx)` returns the text the
 *  autocomplete builders expect (line prefix for SQL, doc prefix for Mongo). */
export function schemaCompletionSource(
  getEntries: (ctx: CompletionContext, textUntil: string, fullText: string) => SchemaCompletionEntry[],
) {
  return (ctx: CompletionContext): CompletionResult | null => {
    // Match only the identifier token immediately preceding the cursor (excluding dots)
    // so property completions (e.g. table.col) replace only the column token rather than the qualifier. (How / Why / What)
    const word = ctx.matchBefore(/[\w$]+/);
    const line = ctx.state.doc.lineAt(ctx.pos);
    const textUntil = ctx.state.sliceDoc(line.from, ctx.pos);
    const entries = getEntries(ctx, textUntil, ctx.state.doc.toString());
    if (entries.length === 0) return null;
    return {
      from: word ? word.from : ctx.pos,
      options: entries.map((item, index) => ({
        label: item.label,
        apply: item.insertText,
        detail: item.detail,
        type: CM_TYPE[item.kind] ?? 'text',
        // Preserve the builders' sort order under CodeMirror's own scoring.
        boost: 99 - index,
      })),
    };
  };
}

/** Completion extension for the given source — drop into `extensions`. */
export function schemaCompletions(source: (ctx: CompletionContext) => CompletionResult | null): Extension {
  return autocompletion({ override: [source] });
}
