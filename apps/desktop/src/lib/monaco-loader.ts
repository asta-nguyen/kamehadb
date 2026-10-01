/** Load the React wrapper with the bundled Monaco instance so Tauri does not need its blocked CDN default. */
export async function loadMonacoEditor() {
  const [{ default: Editor, loader }, monaco] = await Promise.all([
    import('@monaco-editor/react'),
    import('monaco-editor'),
  ]);

  loader.config({ monaco });
  return { default: Editor };
}
