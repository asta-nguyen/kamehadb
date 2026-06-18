import '@xterm/xterm/css/xterm.css';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { TerminalSize } from '@/lib/terminal-session';

type TerminalPaneApi = {
  readonly focus: () => void;
  readonly getSize: () => TerminalSize;
  readonly reset: () => void;
  readonly write: (data: Uint8Array | string) => void;
};

type TerminalPaneProps = {
  readonly active: boolean;
  readonly dark: boolean;
  readonly onInput: (data: string) => void;
  readonly onReady: (api: TerminalPaneApi) => void;
  readonly onResize: (size: TerminalSize) => void;
};

type XtermModule = typeof import('@xterm/xterm');
type FitAddonModule = typeof import('@xterm/addon-fit');
type XtermTerminal = InstanceType<XtermModule['Terminal']>;
type XtermFitAddon = InstanceType<FitAddonModule['FitAddon']>;

function makeTheme(dark: boolean) {
  return dark
    ? {
        background: '#09090b',
        foreground: '#f4f4f5',
        cursor: '#f4f4f5',
        cursorAccent: '#09090b',
        selectionBackground: '#3f3f46',
      }
    : {
        background: '#fafafa',
        foreground: '#18181b',
        cursor: '#18181b',
        cursorAccent: '#fafafa',
        selectionBackground: '#d4d4d8',
      };
}

export function TerminalPane({ active, dark, onInput, onReady, onResize }: TerminalPaneProps) {
  const activeRef = useRef(active);
  const darkRef = useRef(dark);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<XtermFitAddon | null>(null);
  const readyRef = useRef(onReady);
  const inputRef = useRef(onInput);
  const resizeRef = useRef(onResize);
  const [booting, setBooting] = useState(true);

  readyRef.current = onReady;
  inputRef.current = onInput;
  resizeRef.current = onResize;
  activeRef.current = active;
  darkRef.current = dark;

  const emitSize = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal || terminal.cols <= 0 || terminal.rows <= 0) return;
    resizeRef.current({ cols: terminal.cols, rows: terminal.rows });
  }, []);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let dataDisposable: { dispose(): void } | null = null;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (disposed || !containerRef.current) return;

      const terminal = new Terminal({
        allowTransparency: false,
        convertEol: false,
        cursorBlink: true,
        cursorStyle: 'block',
        fontFamily:
          '"Geist Mono Variable", "Geist Mono", "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 14,
        fontWeight: 400,
        letterSpacing: 0,
        lineHeight: 1.15,
        minimumContrastRatio: 7,
        scrollback: 5000,
        theme: makeTheme(darkRef.current),
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();

      dataDisposable = terminal.onData((data) => {
        inputRef.current(data);
      });
      resizeObserver = new ResizeObserver(() => {
        if (!activeRef.current) return;
        fitAddon.fit();
        emitSize();
      });
      resizeObserver.observe(containerRef.current);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      readyRef.current({
        focus: () => terminal.focus(),
        getSize: () => ({ cols: terminal.cols, rows: terminal.rows }),
        reset: () => terminal.reset(),
        write: (data) => terminal.write(data),
      });
      emitSize();
      if (activeRef.current) {
        terminal.focus();
      }
      setBooting(false);
    })();

    return () => {
      disposed = true;
      dataDisposable?.dispose();
      resizeObserver?.disconnect();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [emitSize]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = makeTheme(dark);
  }, [dark]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!active || !terminal || !fitAddon) return;

    const raf = window.requestAnimationFrame(() => {
      fitAddon.fit();
      emitSize();
      terminal.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [active, emitSize]);

  return (
    <div className={`relative min-h-0 flex-1 ${dark ? 'bg-zinc-950' : 'bg-zinc-50'}`}>
      <div ref={containerRef} className="h-full w-full px-3 py-2" />
      {booting ? (
        <div
          className={`absolute inset-0 flex items-center justify-center text-sm ${
            dark ? 'text-zinc-400' : 'text-zinc-500'
          }`}
        >
          Loading terminal…
        </div>
      ) : null}
    </div>
  );
}
