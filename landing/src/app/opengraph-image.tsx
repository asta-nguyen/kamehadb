import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getBaseUrl } from '@/lib/url';

export const alt = 'KamehaDB — Local-first desktop database workspace';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ENGINES_ROW1 = [
  { name: 'PostgreSQL', color: '#336791' },
  { name: 'MySQL', color: '#00758F' },
  { name: 'MongoDB', color: '#4DB33D' },
  { name: 'Redis', color: '#DC382D' },
  { name: 'Qdrant', color: '#19CCA3' },
  { name: 'SQLite', color: '#fbbf24' },
];

const ENGINES_ROW2 = [
  { name: 'SQL Server', color: '#00A4EF' },
  { name: 'Oracle', color: '#F80000' },
  { name: 'ClickHouse', color: '#FCC624' },
  { name: 'DuckDB', color: '#FFF000' },
  { name: 'MariaDB', color: '#C0765A' },
  { name: 'TigerBeetle', color: '#f59e0b' },
];

function Pill({ name, color }: { name: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: 6,
        paddingBottom: 6,
        borderRadius: 15,
        background: 'linear-gradient(to bottom, #1c1c2a, #12121a)',
        border: '0.5px solid #27273a',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: '#d4d4d8', whiteSpace: 'nowrap' }}>{name}</span>
    </div>
  );
}

export default async function Image() {
  // Embed the smaller logo.png (256x256, ~63KB) as base64 for the icon
  const logoData = await readFile(join(process.cwd(), 'public', 'logo.png'), 'base64');
  const logoSrc = `data:image/png;base64,${logoData}`;
  const baseUrl = await getBaseUrl();
  const hostname = new URL(baseUrl).hostname;

  let stars = 0;
  try {
    const repoRes = await fetch('https://api.github.com/repos/asta-nguyen/kamehadb', {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    });
    if (repoRes.ok) {
      const repoData = await repoRes.json();
      stars = repoData.stargazers_count ?? 0;
    }
  } catch {}

  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'row',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0d0d14 50%, #050508 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow orbs */}
      <div
        style={{
          position: 'absolute',
          top: 100,
          left: 100,
          width: 500,
          height: 430,
          background:
            'radial-gradient(ellipse at 40% 40%, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.08) 30%, transparent 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 80,
          right: 80,
          width: 400,
          height: 400,
          background:
            'radial-gradient(ellipse at 60% 60%, rgba(244,63,94,0.10) 0%, rgba(244,63,94,0.04) 60%, transparent 70%)',
        }}
      />

      {/* Left column — icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 260,
          height: '100%',
          paddingLeft: 40,
        }}
      >
        {/* Icon glow ring */}
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 110,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'radial-gradient(ellipse at 40% 40%, rgba(245,158,11,0.35) 0%, rgba(245,158,11,0.12) 35%, transparent 70%)',
          }}
        >
          {/* Icon background panel */}
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 34,
              backgroundColor: '#0d0d14',
              border: '1.5px solid rgba(251,191,36,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Rounded inner frame */}
            <div
              style={{
                width: 148,
                height: 148,
                borderRadius: 30,
                backgroundColor: '#08080e',
                border: '0.5px solid rgba(39,39,58,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <img src={logoSrc} width={100} height={100} />
            </div>
          </div>
        </div>
      </div>

      {/* Vertical divider */}
      <div
        style={{
          width: 1,
          height: 394,
          backgroundColor: '#27273a',
          opacity: 0.5,
          alignSelf: 'center',
        }}
      />

      {/* Right column — content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          paddingLeft: 48,
          paddingRight: 60,
        }}
      >
        {/* Title */}
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2.8, color: '#fbbf24', lineHeight: 1.1 }}>
          KamehaDB
        </div>

        {/* Tagline */}
        <div style={{ fontSize: 24, fontWeight: 400, color: '#a1a1aa', letterSpacing: 0.2, marginTop: 12 }}>
          Local-first desktop database workspace
        </div>

        {/* Feature bullets */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: 24, marginTop: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' }} />
            <span style={{ fontSize: 17, fontWeight: 400, color: '#71717a' }}>SQL, document, cache &amp; vector</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' }} />
            <span style={{ fontSize: 17, fontWeight: 400, color: '#71717a' }}>AI-powered chat</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' }} />
            <span style={{ fontSize: 17, fontWeight: 400, color: '#71717a' }}>Schema timeline &amp; diff</span>
          </div>
        </div>

        {/* Engine badges row 1 */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: 8, marginTop: 24 }}>
          {ENGINES_ROW1.map((e) => (
            <Pill key={e.name} name={e.name} color={e.color} />
          ))}
        </div>

        {/* Engine badges row 2 */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {ENGINES_ROW2.map((e) => (
            <Pill key={e.name} name={e.name} color={e.color} />
          ))}
        </div>

        {/* Subtitle + GitHub stars */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 400, color: '#52525b', letterSpacing: 0.3 }}>
            12 database engines — all in one local-first app
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#71717a', letterSpacing: 0.3 }}>
            {'\u2b50'} {stars.toLocaleString()} stars on GitHub
          </span>
        </div>

        {/* CTA */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 20,
            paddingLeft: 24,
            paddingRight: 24,
            paddingTop: 12,
            paddingBottom: 12,
            borderRadius: 23,
            background: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(244,63,94,0.04))',
            border: '1px solid rgba(245,158,11,0.30)',
            alignSelf: 'flex-start',
            fontSize: 17,
            fontWeight: 600,
            color: '#fbbf24',
          }}
        >
          Download for free →
        </div>
      </div>

      {/* Footer URL */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: 40,
          fontSize: 12,
          fontWeight: 400,
          color: '#3f3f46',
          letterSpacing: 0.6,
        }}
      >
        {hostname}
      </div>
    </div>,
    {
      ...size,
    },
  );
}
