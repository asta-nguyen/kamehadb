import { NextRequest } from 'next/server';
import { Renderer } from 'takumi-js/wasm';
import init, { type InitInput } from '@takumi-rs/wasm';
import wasmModule from '@takumi-rs/wasm/next';
import { fromJsx } from '@takumi-rs/helpers/jsx';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const ffmpegBin = ffmpegStatic && existsSync(ffmpegStatic) ? ffmpegStatic : 'ffmpeg';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = false; // Never revalidate — fully static at build time

const SITE_URL = 'https://kamehadb.astalife.co';

let wasmInitialized = false;
async function ensureWasmInit() {
  if (!wasmInitialized) {
    await init(wasmModule as unknown as InitInput);
    wasmInitialized = true;
  }
}

/* ── Landing page color scheme (amber/rose) ── */
const AMBER = '#f59e0b';
const AMBER_BRIGHT = '#fbbf24';
const ROSE = '#f43f5e';
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

// Triple for continuous scroll — always content filling the viewport
const MARQUEE_ENGINES = [...ALL_ENGINES, ...ALL_ENGINES, ...ALL_ENGINES];

// Single-line queries matching the landing page TerminalTypewriter
const QUERIES = [
  "SELECT name, SUM(amount) AS total FROM orders WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY name ORDER BY total DESC;",
  "db.orders.aggregate([{ $match: { status: 'shipped' } }, { $group: { _id: '$region', total: { $sum: '$amount' } } }])",
];

async function loadFont(family: string, weight: number): Promise<ArrayBuffer | null> {
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

function logoDataUri(): string {
  const png = readFileSync(join(process.cwd(), 'public/logo.png'));
  const b64 = Buffer.from(png).toString('base64');
  return `data:image/png;base64,${b64}`;
}

/* ── Animation helpers ── */
function cursorBlink(t: number): number {
  return Math.sin(t * Math.PI * 4) > 0 ? 1 : 0;
}

// Slow typing: 0..0.45 type q1, 0.45..0.50 pause, 0.50..0.95 type q2, 0.95..1 pause
function typingProgress(t: number): { text: string; done: boolean } {
  let seqIdx: number;
  let localT: number;

  if (t < 0.45) {
    seqIdx = 0;
    localT = t / 0.45;
  } else if (t < 0.5) {
    seqIdx = 0;
    localT = 1;
  } else if (t < 0.95) {
    seqIdx = 1;
    localT = (t - 0.5) / 0.45;
  } else {
    seqIdx = 1;
    localT = 1;
  }

  const query = QUERIES[seqIdx];
  const charsShown = Math.floor(localT * query.length);
  return { text: query.slice(0, charsShown), done: localT >= 1 };
}

/* ── Frame builder ── */
interface FrameContext {
  displayFont: string;
  monoFont: string;
  logoUri: string;
  starCount: number | null;
  formatStars: (n: number) => string;
}

function buildFrameElement(t: number, ctx: FrameContext) {
  const { displayFont, monoFont, logoUri, starCount, formatStars } = ctx;
  const blink = cursorBlink(t);
  const typed = typingProgress(t);

  // Continuous marquee — slow scroll, seamless loop
  // Pills fade by opacity near edges (not a mask overlay)
  const pillW = 100;
  const pillGap = 8;
  const oneSetWidth = ALL_ENGINES.length * (pillW + pillGap);
  const scrollX = (t * oneSetWidth) % oneSetWidth;
  const marqueeViewport = 576;
  const fadeZone = 60; // px from edge where pills start fading

  function pillOpacity(x: number): number {
    // x is the left edge of the pill relative to viewport
    const rightEdge = x + pillW;
    // Fade from left edge
    const fromLeft = x / fadeZone;
    // Fade from right edge
    const fromRight = (marqueeViewport - rightEdge) / fadeZone;
    return Math.max(0, Math.min(1, fromLeft, fromRight));
  }

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(135deg, ${BG_DEEP} 0%, #0A0F1C 50%, #05080F 100%)`,
        fontFamily: displayFont,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Faint grid pattern background — like landing page */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(rgba(245,158,11,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.05) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Amber glow orb — left */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 80,
          width: 450,
          height: 450,
          background: `radial-gradient(ellipse at 40% 40%, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0.03) 40%, transparent 70%)`,
        }}
      />
      {/* Rose glow orb — right */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 60,
          width: 380,
          height: 380,
          background: `radial-gradient(ellipse at 60% 60%, rgba(244,63,94,0.06) 0%, rgba(244,63,94,0.02) 60%, transparent 70%)`,
        }}
      />

      {/* Main content — two columns (40/60) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: 1200,
          height: 580,
          paddingLeft: 64,
          paddingRight: 64,
          paddingTop: 50,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Left column — branding (40%) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: 432,
            paddingRight: 32,
          }}
        >
          {/* Logo + name */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: BG_PANEL,
                border: `1px solid rgba(251,191,36,0.25)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <img src={logoUri} width={34} height={34} />
            </div>
            <span style={{ fontSize: 24, fontWeight: 700, color: AMBER_BRIGHT, letterSpacing: -0.5 }}>KamehaDB</span>
          </div>

          {/* Badges row */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 20,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 5,
                paddingBottom: 5,
                borderRadius: 100,
                backgroundColor: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.20)',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: AMBER }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: AMBER_BRIGHT }}>
                12+ engines • SQL, document, cache, vector &amp; ledger
              </span>
            </div>
            {/* No sign in required — eye-catching green badge */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 5,
                paddingBottom: 5,
                borderRadius: 100,
                backgroundColor: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.30)',
              }}
            >
              <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 700 }}>{'\u2713'}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#4ade80' }}>No sign in required</span>
            </div>
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              color: TEXT_PRIMARY,
              lineHeight: 1.12,
              letterSpacing: -1.3,
              marginTop: 18,
            }}
          >
            Your databases,
            <br />
            in one <span style={{ color: AMBER }}>local-first</span>
            <br />
            workspace
          </div>

          {/* Subheadline */}
          <div
            style={{
              fontSize: 15,
              fontWeight: 400,
              color: TEXT_SECONDARY,
              lineHeight: 1.5,
              marginTop: 14,
            }}
          >
            Cross-platform desktop GUI for SQL, document,
            <br />
            cache, vector, and ledger systems — with AI built in.
          </div>

          {/* Feature bullets with icons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  backgroundColor: 'rgba(245,158,11,0.15)',
                  border: `1px solid ${AMBER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: AMBER }} />
              </div>
              <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>AI that knows your schema</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  backgroundColor: 'rgba(245,158,11,0.15)',
                  border: `1px solid ${AMBER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: AMBER }} />
              </div>
              <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>Schema timeline &amp; diff</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  backgroundColor: 'rgba(245,158,11,0.15)',
                  border: `1px solid ${AMBER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: AMBER }} />
              </div>
              <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>12 engines in one workspace</span>
            </div>
          </div>

          {/* Download CTA — amber gradient, more rounded, with OS icons in pill */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingLeft: 24,
                paddingRight: 24,
                paddingTop: 12,
                paddingBottom: 12,
                borderRadius: 28,
                background: `linear-gradient(135deg, ${AMBER}, #f97316)`,
                fontSize: 16,
                fontWeight: 700,
                color: BG_DEEP,
                boxShadow: `0 0 20px rgba(245,158,11,0.25)`,
              }}
            >
              Download for free →
            </div>
            {/* OS icons wrapped in a pill */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 8,
                paddingBottom: 8,
                borderRadius: 28,
                backgroundColor: 'rgba(13,13,20,0.80)',
                border: `1px solid ${BORDER}`,
              }}
            >
              {/* macOS icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill={TEXT_SECONDARY}>
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              {/* Windows icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill={TEXT_SECONDARY}>
                <path d="M3 5.1L10.4 4v7.3H3V5.1zM10.4 12.7V20L3 18.9v-6.2h7.4zM11.6 3.8L21 2.5v8.8h-9.4V3.8zM21 12.7v8.8l-9.4-1.3v-7.5H21z" />
              </svg>
              {/* Linux icon (penguin simplified) */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill={TEXT_SECONDARY}>
                <path d="M12 2c-1.5 0-2.5 1.5-2.5 3v3c0 1-1 2-1.5 3-1 2-2 3-2 5 0 2 1.5 4 4 4h4c2.5 0 4-2 4-4 0-2-1-3-2-5-.5-1-1.5-2-1.5-3V5c0-1.5-1-3-2.5-3z" />
              </svg>
            </div>
          </div>

          {/* Stars + site URL */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            {starCount !== null && (
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>
                {'\u2b50'} {formatStars(starCount)} stars
              </span>
            )}
            {starCount !== null && <span style={{ fontSize: 12, color: TEXT_MUTED }}>•</span>}
            <span style={{ fontSize: 12, color: AMBER_BRIGHT }}>{SITE_URL.replace('https://', '')}</span>
          </div>
        </div>

        {/* Right column — terminal mockup (60%) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: 576,
          }}
        >
          {/* Terminal window with amber glow */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 12,
              overflow: 'hidden',
              border: `1px solid ${BORDER}`,
              boxShadow: `0 0 40px rgba(245,158,11,0.08), 0 20px 60px rgba(0,0,0,0.5)`,
            }}
          >
            {/* Terminal header */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingLeft: 14,
                paddingRight: 14,
                paddingTop: 10,
                paddingBottom: 10,
                backgroundColor: BG_HEADER,
                borderBottom: `1px solid ${BORDER}`,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff5f57' }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#febc2e' }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#28c840' }} />
              <span
                style={{
                  fontSize: 11,
                  color: '#52525b',
                  fontFamily: monoFont,
                  marginLeft: 8,
                }}
              >
                query.sql
              </span>
            </div>

            {/* Terminal body — prompt + single typing line */}
            <div
              style={{
                backgroundColor: BG_PANEL,
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                height: 130,
              }}
            >
              {/* Prompt line: kamehadb @local:~$ */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontFamily: monoFont,
                }}
              >
                <span style={{ color: '#28c840', fontWeight: 600 }}>kamehadb</span>
                <span style={{ color: '#52525b' }}>@</span>
                <span style={{ color: AMBER_BRIGHT, fontWeight: 600 }}>local</span>
                <span style={{ color: '#52525b' }}>:</span>
                <span style={{ color: TEXT_SECONDARY }}>~</span>
                <span style={{ color: '#52525b' }}>$</span>
              </div>

              {/* Typing query — single line, wraps naturally */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  fontSize: 12,
                  fontFamily: monoFont,
                  color: TEXT_PRIMARY,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{typed.text}</span>
                <div
                  style={{
                    width: 7,
                    height: 14,
                    backgroundColor: blink ? AMBER_BRIGHT : 'transparent',
                    marginLeft: 1,
                    marginTop: 2,
                  }}
                />
              </div>

              {/* Result line — shows when typing done */}
              {typed.done && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontFamily: monoFont,
                    color: '#28c840',
                    marginTop: 4,
                  }}
                >
                  <span>{'\u2713'}</span>
                  <span>42 rows in 23ms</span>
                </div>
              )}
            </div>
          </div>

          {/* Marquee engine pills — infinite scroll, pills fade by opacity at edges */}
          <div
            style={{
              marginTop: 14,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              position: 'relative',
              width: 576,
              height: 30,
            }}
          >
            {MARQUEE_ENGINES.map((e, i) => {
              // Position of pill i relative to viewport
              const pillX = i * (pillW + pillGap) - scrollX;
              const op = pillOpacity(pillX);
              if (op <= 0) return null;
              return (
                <div
                  key={`pill-${i}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    width: pillW,
                    height: 26,
                    borderRadius: 8,
                    background: `linear-gradient(to bottom, #1c1c2a, ${BG_HEADER})`,
                    border: `0.5px solid ${BORDER}`,
                    flexShrink: 0,
                    opacity: op,
                    position: 'absolute',
                    left: pillX,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: e.color, flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: TEXT_PRIMARY,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {e.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export async function GET(_req: NextRequest) {
  const [outfit700, outfit800, jbMono400] = await Promise.all([
    loadFont('Outfit', 700),
    loadFont('Outfit', 800),
    loadFont('JetBrains Mono', 400),
  ]);

  const displayFont = outfit700 ? 'Outfit, system-ui, sans-serif' : 'system-ui, sans-serif';
  const monoFont = jbMono400 ? 'JetBrains Mono, monospace' : 'ui-monospace, monospace';
  const logoUri = logoDataUri();

  // Stars fetched at build time only — force-cache ensures static, no revalidation
  let starCount: number | null = null;
  try {
    const res = await fetch('https://api.github.com/repos/asta-nguyen/kamehadb', {
      cache: 'force-cache',
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.stargazers_count === 'number') starCount = data.stargazers_count;
    }
  } catch {}

  const formatStars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  const fonts: Array<{ name: string; data: ArrayBuffer; weight: number; style: string }> = [];
  if (outfit700) fonts.push({ name: 'Outfit', data: outfit700, weight: 700, style: 'normal' });
  if (outfit800) fonts.push({ name: 'Outfit', data: outfit800, weight: 800, style: 'normal' });
  if (jbMono400) fonts.push({ name: 'JetBrains Mono', data: jbMono400, weight: 400, style: 'normal' });

  await ensureWasmInit();

  const renderer = new Renderer({
    fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
    loadDefaultFonts: fonts.length === 0,
  });

  const ctx: FrameContext = { displayFont, monoFont, logoUri, starCount, formatStars };

  // Slow 12s loop at 30fps = 360 frames (smoother)
  const fps = 30;
  const totalMs = 12000;
  const totalFrames = Math.floor((totalMs / 1000) * fps);

  const { stylesheets } = await fromJsx(buildFrameElement(0, ctx));

  const tmpDir = await mkdtemp(join(tmpdir(), 'kameha-og-'));

  try {
    for (let i = 0; i < totalFrames; i++) {
      const t = i / totalFrames;
      const { node } = await fromJsx(buildFrameElement(t, ctx));
      const pngBuffer = renderer.render(node, {
        width: 1200,
        height: 630,
        format: 'png',
        stylesheets,
      });
      const num = String(i).padStart(5, '0');
      await writeFile(join(tmpDir, `frame_${num}.png`), pngBuffer as Buffer);
    }

    // FFmpeg two-pass: palettegen → paletteuse
    const palettePath = join(tmpDir, 'palette.png');
    const framePattern = join(tmpDir, 'frame_%05d.png');
    const gifPath = join(tmpDir, 'output.gif');

    await execFileAsync(
      ffmpegBin,
      ['-framerate', String(fps), '-i', framePattern, '-vf', 'palettegen=stats_mode=full', '-y', palettePath],
      { timeout: 180000 },
    );

    await execFileAsync(
      ffmpegBin,
      [
        '-framerate',
        String(fps),
        '-i',
        framePattern,
        '-i',
        palettePath,
        '-lavfi',
        'paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
        '-y',
        gifPath,
      ],
      { timeout: 180000 },
    );

    const gifBuffer = await readFile(gifPath);

    return new Response(gifBuffer as BodyInit, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
