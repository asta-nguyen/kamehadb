import { Renderer, initSync } from '@takumi-rs/wasm';
import { fromHtml } from '@takumi-rs/helpers/html';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const ffmpegBin = ffmpegStatic && existsSync(ffmpegStatic) ? ffmpegStatic : 'ffmpeg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingRoot = join(__dirname, '..');
const outPath = join(landingRoot, 'public', 'og-animated.gif');

const SITE_URL = 'https://kamehadb.astalife.co';
const AMBER = '#f59e0b';
const AMBER_BRIGHT = '#fbbf24';
const TEXT_PRIMARY = '#fafafa';
const TEXT_SECONDARY = '#a1a1aa';
const TEXT_MUTED = '#71717a';
const BG_DEEP = '#0a0a0f';
const BG_PANEL = '#0d0d14';
const BG_HEADER = '#12121a';
const BORDER = '#27273a';

const ALL_ENGINES = [
  { name: 'PostgreSQL', color: '#336791' },
  { name: 'MySQL', color: '#00758F' },
  { name: 'MongoDB', color: '#4DB33D' },
  { name: 'Redis', color: '#DC382D' },
  { name: 'Qdrant', color: '#19CCA3' },
  { name: 'SQLite', color: '#fbbf24' },
  { name: 'SQL Server', color: '#00A4EF' },
  { name: 'Oracle', color: '#F80000' },
  { name: 'ClickHouse', color: '#FCC624' },
  { name: 'DuckDB', color: '#FFF000' },
  { name: 'MariaDB', color: '#C0765A' },
  { name: 'TigerBeetle', color: '#f59e0b' },
];

const MARQUEE_ENGINES = [...ALL_ENGINES, ...ALL_ENGINES, ...ALL_ENGINES];

const QUERIES = [
  "SELECT name, SUM(amount) AS total FROM orders WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY name ORDER BY total DESC;",
  "db.orders.aggregate([{ $match: { status: 'shipped' } }, { $group: { _id: '$region', total: { $sum: '$amount' } } }])",
];

async function loadFont(family, weight) {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&display=swap`;
    const cssRes = await fetch(cssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      cache: 'force-cache',
    });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(/src:\s*url\(([^)]+)\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1], { cache: 'force-cache' });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

function logoDataUri() {
  const png = readFileSync(join(landingRoot, 'public/logo.png'));
  const b64 = Buffer.from(png).toString('base64');
  return `data:image/png;base64,${b64}`;
}

function cursorBlink(t) {
  return Math.sin(t * Math.PI * 4) > 0 ? 1 : 0;
}

function typingProgress(t) {
  let seqIdx, localT;
  if (t < 0.45) { seqIdx = 0; localT = t / 0.45; }
  else if (t < 0.5) { seqIdx = 0; localT = 1; }
  else if (t < 0.95) { seqIdx = 1; localT = (t - 0.5) / 0.45; }
  else { seqIdx = 1; localT = 1; }
  const query = QUERIES[seqIdx];
  const charsShown = Math.floor(localT * query.length);
  return { text: query.slice(0, charsShown), done: localT >= 1 };
}

const MAC_ICON = '<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>';
const WIN_ICON = '<path d="M3 5.1L10.4 4v7.3H3V5.1zM10.4 12.7V20L3 18.9v-6.2h7.4zM11.6 3.8L21 2.5v8.8h-9.4V3.8zM21 12.7v8.8l-9.4-1.3v-7.5H21z"/>';
const LINUX_ICON = '<path d="M12 2c-1.5 0-2.5 1.5-2.5 3v3c0 1-1 2-1.5 3-1 2-2 3-2 5 0 2 1.5 4 4 4h4c2.5 0 4-2 4-4 0-2-1-3-2-5-.5-1-1.5-2-1.5-3V5c0-1.5-1-3-2.5-3z"/>';

function buildFrameHtml(t, ctx) {
  const { displayFont, monoFont, logoUri, starCount, formatStars } = ctx;
  const blink = cursorBlink(t);
  const typed = typingProgress(t);
  const pillW = 100;
  const pillGap = 8;
  const oneSetWidth = ALL_ENGINES.length * (pillW + pillGap);
  const scrollX = (t * oneSetWidth) % oneSetWidth;
  const marqueeViewport = 576;
  const fadeZone = 60;

  const pillOpacity = (x) => {
    const rightEdge = x + pillW;
    return Math.max(0, Math.min(1, x / fadeZone, (marqueeViewport - rightEdge) / fadeZone));
  };

  const pills = MARQUEE_ENGINES.map((e, i) => {
    const pillX = i * (pillW + pillGap) - scrollX;
    const op = pillOpacity(pillX);
    if (op <= 0) return '';
    return `<div style="display:flex;flex-direction:row;align-items:center;justify-content:center;gap:5px;width:${pillW}px;height:26px;border-radius:8px;background:linear-gradient(to bottom, #1c1c2a, ${BG_HEADER});border:0.5px solid ${BORDER};flex-shrink:0;opacity:${op};position:absolute;left:${pillX}px;overflow:hidden"><div style="width:6px;height:6px;border-radius:3px;background-color:${e.color};flex-shrink:0"></div><span style="font-size:11px;font-weight:600;color:${TEXT_PRIMARY};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.name}</span></div>`;
  }).join('');

  const resultLine = typed.done
    ? `<div style="display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;font-family:${monoFont};color:#28c840;margin-top:4px"><span>\u2713</span><span>42 rows in 23ms</span></div>`
    : '';

  const starLine = starCount !== null
    ? `<span style="font-size:12px;color:${TEXT_MUTED}">\u2b50 ${formatStars(starCount)} stars</span><span style="font-size:12px;color:${TEXT_MUTED}">•</span>`
    : '';

  return `<div style="width:1200px;height:630px;display:flex;flex-direction:column;background:linear-gradient(135deg, ${BG_DEEP} 0%, #0A0F1C 50%, #05080F 100%);font-family:${displayFont};position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(245,158,11,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.05) 1px, transparent 1px);background-size:48px 48px"></div>
  <div style="position:absolute;top:60px;left:80px;width:450px;height:450px;background:radial-gradient(ellipse at 40% 40%, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0.03) 40%, transparent 70%)"></div>
  <div style="position:absolute;bottom:40px;right:60px;width:380px;height:380px;background:radial-gradient(ellipse at 60% 60%, rgba(244,63,94,0.06) 0%, rgba(244,63,94,0.02) 60%, transparent 70%)"></div>
  <div style="display:flex;flex-direction:row;width:1200px;height:580px;padding-left:64px;padding-right:64px;padding-top:50px;position:relative;z-index:1">
    <div style="display:flex;flex-direction:column;justify-content:center;width:432px;padding-right:32px">
      <div style="display:flex;flex-direction:row;align-items:center;gap:14px">
        <div style="width:48px;height:48px;border-radius:12px;background-color:${BG_PANEL};border:1px solid rgba(251,191,36,0.25);display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="${logoUri}" width="34" height="34"/></div>
        <span style="font-size:24px;font-weight:700;color:${AMBER_BRIGHT};letter-spacing:-0.5px">KamehaDB</span>
      </div>
      <div style="display:flex;flex-direction:row;align-items:center;gap:8px;margin-top:20px;flex-wrap:wrap">
        <div style="display:flex;flex-direction:row;align-items:center;gap:6px;padding-left:12px;padding-right:12px;padding-top:5px;padding-bottom:5px;border-radius:100px;background-color:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.20)"><div style="width:6px;height:6px;border-radius:3px;background-color:${AMBER}"></div><span style="font-size:12px;font-weight:500;color:${AMBER_BRIGHT}">12+ engines &bull; SQL, document, cache, vector &amp; ledger</span></div>
        <div style="display:flex;flex-direction:row;align-items:center;gap:5px;padding-left:12px;padding-right:12px;padding-top:5px;padding-bottom:5px;border-radius:100px;background-color:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.30)"><span style="font-size:13px;color:#22c55e;font-weight:700">\u2713</span><span style="font-size:12px;font-weight:600;color:#4ade80">No sign in required</span></div>
      </div>
      <div style="font-size:40px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.12;letter-spacing:-1.3px;margin-top:18px">Your databases,<br/>in one <span style="color:${AMBER}">local-first</span><br/>workspace</div>
      <div style="font-size:15px;font-weight:400;color:${TEXT_SECONDARY};line-height:1.5;margin-top:14px">Cross-platform desktop GUI for SQL, document,<br/>cache, vector, and ledger systems &mdash; with AI built in.</div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-top:18px">
        <div style="display:flex;flex-direction:row;align-items:center;gap:8px"><div style="width:14px;height:14px;border-radius:4px;background-color:rgba(245,158,11,0.15);border:1px solid ${AMBER};display:flex;align-items:center;justify-content:center"><div style="width:4px;height:4px;border-radius:2px;background-color:${AMBER}"></div></div><span style="font-size:13px;color:${TEXT_SECONDARY}">AI that knows your schema</span></div>
        <div style="display:flex;flex-direction:row;align-items:center;gap:8px"><div style="width:14px;height:14px;border-radius:4px;background-color:rgba(245,158,11,0.15);border:1px solid ${AMBER};display:flex;align-items:center;justify-content:center"><div style="width:4px;height:4px;border-radius:2px;background-color:${AMBER}"></div></div><span style="font-size:13px;color:${TEXT_SECONDARY}">Schema timeline &amp; diff</span></div>
        <div style="display:flex;flex-direction:row;align-items:center;gap:8px"><div style="width:14px;height:14px;border-radius:4px;background-color:rgba(245,158,11,0.15);border:1px solid ${AMBER};display:flex;align-items:center;justify-content:center"><div style="width:4px;height:4px;border-radius:2px;background-color:${AMBER}"></div></div><span style="font-size:13px;color:${TEXT_SECONDARY}">12 engines in one workspace</span></div>
      </div>
      <div style="display:flex;flex-direction:row;align-items:center;gap:10px;margin-top:22px">
        <div style="display:flex;flex-direction:row;align-items:center;gap:8px;padding-left:24px;padding-right:24px;padding-top:12px;padding-bottom:12px;border-radius:28px;background:linear-gradient(135deg, ${AMBER}, #f97316);font-size:16px;font-weight:700;color:${BG_DEEP};box-shadow:0 0 20px rgba(245,158,11,0.25)">Download for free \u2192</div>
        <div style="display:flex;flex-direction:row;align-items:center;gap:8px;padding-left:12px;padding-right:12px;padding-top:8px;padding-bottom:8px;border-radius:28px;background-color:rgba(13,13,20,0.80);border:1px solid ${BORDER}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${TEXT_SECONDARY}">${MAC_ICON}</svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${TEXT_SECONDARY}">${WIN_ICON}</svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${TEXT_SECONDARY}">${LINUX_ICON}</svg>
        </div>
      </div>
      <div style="display:flex;flex-direction:row;align-items:center;gap:8px;margin-top:12px">${starLine}<span style="font-size:12px;color:${AMBER_BRIGHT}">${SITE_URL.replace('https://', '')}</span></div>
    </div>
    <div style="display:flex;flex-direction:column;justify-content:center;width:576px">
      <div style="display:flex;flex-direction:column;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};box-shadow:0 0 40px rgba(245,158,11,0.08), 0 20px 60px rgba(0,0,0,0.5)">
        <div style="display:flex;flex-direction:row;align-items:center;gap:6px;padding-left:14px;padding-right:14px;padding-top:10px;padding-bottom:10px;background-color:${BG_HEADER};border-bottom:1px solid ${BORDER}">
          <div style="width:10px;height:10px;border-radius:5px;background-color:#ff5f57"></div>
          <div style="width:10px;height:10px;border-radius:5px;background-color:#febc2e"></div>
          <div style="width:10px;height:10px;border-radius:5px;background-color:#28c840"></div>
          <span style="font-size:11px;color:#52525b;font-family:${monoFont};margin-left:8px">query.sql</span>
        </div>
        <div style="background-color:${BG_PANEL};padding:16px 18px;display:flex;flex-direction:column;gap:8px;height:130px">
          <div style="display:flex;flex-direction:row;align-items:center;gap:6px;font-size:13px;font-family:${monoFont}">
            <span style="color:#28c840;font-weight:600">kamehadb</span><span style="color:#52525b">@</span><span style="color:${AMBER_BRIGHT};font-weight:600">local</span><span style="color:#52525b">:</span><span style="color:${TEXT_SECONDARY}">~</span><span style="color:#52525b">$</span>
          </div>
          <div style="display:flex;flex-direction:row;align-items:flex-start;font-size:12px;font-family:${monoFont};color:${TEXT_PRIMARY};line-height:1.5">
            <span style="white-space:pre-wrap;word-break:break-all">${typed.text}</span>
            <div style="width:7px;height:14px;background-color:${blink ? AMBER_BRIGHT : 'transparent'};margin-left:1px;margin-top:2px"></div>
          </div>
          ${resultLine}
        </div>
      </div>
      <div style="margin-top:14px;overflow:hidden;display:flex;flex-direction:row;align-items:center;position:relative;width:576px;height:30px">${pills}</div>
    </div>
  </div>
</div>`;
}

async function main() {
  const [outfit700, outfit800, jbMono400] = await Promise.all([
    loadFont('Outfit', 700),
    loadFont('Outfit', 800),
    loadFont('JetBrains Mono', 400),
  ]);

  const displayFont = (outfit700 || outfit800) ? 'Outfit, system-ui, sans-serif' : 'system-ui, sans-serif';
  const monoFont = jbMono400 ? 'JetBrains Mono, monospace' : 'ui-monospace, monospace';
  const logoUri = logoDataUri();

  let starCount = null;
  try {
    const res = await fetch('https://api.github.com/repos/asta-nguyen/kamehadb', { cache: 'force-cache' });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.stargazers_count === 'number') starCount = data.stargazers_count;
    }
  } catch {}

  const formatStars = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  const fonts = [];
  if (outfit700) fonts.push({ name: 'Outfit', data: outfit700, weight: 700, style: 'normal' });
  if (outfit800) fonts.push({ name: 'Outfit', data: outfit800, weight: 800, style: 'normal' });
  if (jbMono400) fonts.push({ name: 'JetBrains Mono', data: jbMono400, weight: 400, style: 'normal' });

  const wasmPath = new URL('../node_modules/@takumi-rs/wasm/pkg/takumi_wasm_bg.wasm', import.meta.url);
  const wasmModule = await readFile(wasmPath);
  initSync(wasmModule);

  const renderer = new Renderer({
    fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
    loadDefaultFonts: fonts.length === 0,
  });

  const ctx = { displayFont, monoFont, logoUri, starCount, formatStars };

  const fps = 30;
  const totalMs = 12000;
  const totalFrames = Math.floor((totalMs / 1000) * fps);

  const { stylesheets } = fromHtml(buildFrameHtml(0, ctx));

  const tmpDir = await mkdtemp(join(tmpdir(), 'kameha-og-'));
  try {
    for (let i = 0; i < totalFrames; i++) {
      const t = i / totalFrames;
      const { node } = fromHtml(buildFrameHtml(t, ctx));
      const pngBuffer = renderer.render(node, {
        width: 1200,
        height: 630,
        format: 'png',
        stylesheets,
      });
      const num = String(i).padStart(5, '0');
      await writeFile(join(tmpDir, `frame_${num}.png`), pngBuffer);
      if (i % 30 === 0) console.log(`frame ${i}/${totalFrames}`);
    }

    const palettePath = join(tmpDir, 'palette.png');
    const framePattern = join(tmpDir, 'frame_%05d.png');

    await execFileAsync(
      ffmpegBin,
      ['-framerate', String(fps), '-i', framePattern, '-vf', 'palettegen=stats_mode=full', '-y', palettePath],
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
    );

    await execFileAsync(
      ffmpegBin,
      [
        '-framerate', String(fps),
        '-i', framePattern,
        '-i', palettePath,
        '-lavfi', 'paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
        '-y', outPath,
      ],
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
    );

    console.log(`Wrote ${outPath}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
