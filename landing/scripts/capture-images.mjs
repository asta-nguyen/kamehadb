#!/usr/bin/env node
/**
 * Screenshot capture script for the AI Compare panel on the landing page.
 *
 * Starts the Next.js dev server, navigates to the landing page, and captures
 * fresh screenshots of the chat panel and SQL panel into public/images/.
 * These images are used by the Compare slider component in home-view.tsx.
 *
 * Usage:
 *   node landing/scripts/capture-images.mjs
 *
 * Requirements:
 *   - Playwright Chromium browser installed (npx playwright install chromium)
 *   - landing/ dependencies installed (npm --prefix landing install)
 *
 * In CI this runs on every release tag (v*) via .github/workflows/screenshot-refresh.yml.
 * Locally it can be run manually to refresh screenshots before a release.
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingRoot = join(__dirname, '..');
const imagesDir = join(landingRoot, 'public', 'images');

// Fixed port so the script is deterministic — avoids conflicts with common dev ports.
const PORT = 3210;
const BASE_URL = `http://localhost:${PORT}`;

/** Wait for the dev server to respond before launching the browser. */
function waitForServer(url, retries = 30, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status < 500) {
          resolve();
          return;
        }
      } catch {
        // Server not ready yet — keep polling.
      }
      attempts += 1;
      if (attempts >= retries) {
        reject(new Error(`Server at ${url} did not become ready after ${retries} attempts`));
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

async function main() {
  // Ensure the output directory exists.
  await mkdir(imagesDir, { recursive: true });

  // Start the Next.js dev server on the fixed port.
  // We use next dev because it requires no build step and boots in seconds.
  const devServer = spawn('npx', ['next', 'dev', '--port', String(PORT)], {
    cwd: landingRoot,
    stdio: 'pipe',
    shell: true,
  });

  devServer.stdout.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`));
  devServer.stderr.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`));

  try {
    // Dynamically import Playwright so the script doesn't crash if the package
    // is missing in environments that only need the workflow file.
    const { chromium } = await import('playwright');

    console.log(`Waiting for dev server at ${BASE_URL}...`);
    await waitForServer(BASE_URL);
    console.log('Dev server is ready.');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    console.log('Navigating to landing page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Wait for the AI Compare section to render — it uses the Compare component
    // which loads two images. We wait for the section heading to appear.
    const compareHeading = await page.getByText('Just say what you need').first();
    await compareHeading.scrollIntoViewIfNeeded();
    // Give the Compare slider and images time to settle after scroll.
    await page.waitForTimeout(2000);

    // The Compare component renders two layered <img> elements (via next/image
    // with fill). Instead of dragging the slider and screenshotting the
    // composite (which bakes in the slider chrome), we screenshot the
    // underlying <img> elements directly so the output is the raw source panel.
    const compareContainer = page.locator('[class*="shadow-2xl"]').filter({
      hasText: 'You asks',
    });

    // The two <img> tags inside the Compare component. The first image
    // (chat-panel) is rendered in a clipped overlay; the second image
    // (sql-panel) is rendered underneath. Both fill the container.
    const compareImages = compareContainer.locator('img');
    await compareImages.first().waitFor({ state: 'visible' });

    // Hide the slider line + handle so they don't appear in screenshots.
    await page.addStyleTag({
      content: '[data-testid="compare-slider-handle"] { display: none !important; } .compare-container [class*="z-30"] { display: none !important; }',
    });

    // chat-panel.png — the first image (top overlay).
    await compareImages.nth(0).screenshot({
      path: join(imagesDir, 'chat-panel.png'),
    });
    console.log('Saved chat-panel.png');

    // sql-panel.png — the second image (underneath).
    await compareImages.nth(1).screenshot({
      path: join(imagesDir, 'sql-panel.png'),
    });
    console.log('Saved sql-panel.png');

    await browser.close();
    console.log('Screenshot capture complete.');
  } finally {
    // Always kill the dev server, even if screenshot capture fails.
    devServer.kill('SIGTERM');
    await new Promise((resolve) => {
      devServer.on('exit', () => resolve());
      // Force-kill after 5s if SIGTERM doesn't work.
      setTimeout(() => {
        devServer.kill('SIGKILL');
        resolve();
      }, 5000);
    });
  }
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
