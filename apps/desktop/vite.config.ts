/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  assetsInclude: ['**/*.svg'],
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts'],
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
