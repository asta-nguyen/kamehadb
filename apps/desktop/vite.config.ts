/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { execSync } from 'child_process';

const host = process.env.TAURI_DEV_HOST;

// Derive the app version from the latest git tag so the UI stays in sync
// with GitHub releases instead of a hardcoded package.json value.
function getAppVersion(): string {
  try {
    return execSync('git describe --tags --always', { encoding: 'utf-8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  assetsInclude: ['**/*.svg'],
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3170',
        changeOrigin: false,
      },
    },
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
