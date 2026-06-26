'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import {
  siPostgresql,
  siMysql,
  siMongodb,
  siRedis,
  siSqlite,
  siClickhouse,
  siDuckdb,
  siMariadb,
  siQdrant,
} from 'simple-icons';

const ENGINES = [
  { name: 'PostgreSQL', color: '#336791', path: siPostgresql.path },
  { name: 'MySQL', color: '#00758F', path: siMysql.path },
  { name: 'MongoDB', color: '#4DB33D', path: siMongodb.path },
  { name: 'Redis', color: '#DC382D', path: siRedis.path },
  { name: 'Qdrant', color: '#19CCA3', path: siQdrant.path },
  { name: 'SQLite', color: '#fbbf24', path: siSqlite.path },
  { name: 'ClickHouse', color: '#FCC624', path: siClickhouse.path },
  { name: 'DuckDB', color: '#FFF000', path: siDuckdb.path },
  { name: 'MariaDB', color: '#C0765A', path: siMariadb.path },
];

// Module-level helpers for generating random geometry data — called during
// module init, not React render, so Math.random() does not trigger purity rules.
function spherePositions(count: number, minR: number, maxR: number, yRange: number): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = minR + Math.random() * (maxR - minR);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = (Math.random() - 0.5) * yRange;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  return pos;
}

const STAR_POSITIONS = spherePositions(400, 5, 17, 8);

const PARTICLE_COUNT = 300;
const particlePositions = (() => {
  const pos = new Float32Array(PARTICLE_COUNT * 3);
  const sz = new Float32Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 4 + Math.random() * 10;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sz[i] = 0.02 + Math.random() * 0.06;
  }
  return { positions: pos, sizes: sz };
})();

const FLOW_COUNT = 48;
const flowData = (() => {
  const phases = new Float32Array(FLOW_COUNT);
  const positions = new Float32Array(FLOW_COUNT * 3);
  for (let i = 0; i < FLOW_COUNT; i++) {
    phases[i] = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 5;
    positions[i * 3] = Math.cos(phases[i]) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
    positions[i * 3 + 2] = Math.sin(phases[i]) * r;
  }
  return { phases, positions };
})();

// Each engine orbits independently around KamehaDB
const ORBIT_DATA = ENGINES.map((_, i) => ({
  radius: 4 + Math.random() * 3,
  speed: 0.08 + Math.random() * 0.12,
  phase: (i / ENGINES.length) * Math.PI * 2,
  yOffset: (Math.random() - 0.5) * 2.5,
}));

// Embed SVG path as a data-URI so the icon is self-contained — no network fetch needed.
function buildSvg(color: string, path: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${color}" d="${path}"/></svg>`;
}

// Render an SVG string to a Canvas2D texture by loading it as an Image, then
// drawing the result into a 256×256 offscreen canvas padded by 10% on each side.
// The texture is cached by engine name in TechNode so each icon is rasterised once.
function svgToTexture(svg: string): Promise<THREE.CanvasTexture> {
  return new Promise((resolve) => {
    const w = 256,
      h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, w, h);
      const pad = w * 0.1;
      ctx.drawImage(img, pad, pad, w - pad * 2, h - pad * 2);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
  });
}

type TexCache = Map<string, THREE.CanvasTexture>;

function TechNode({
  engine,
  orbit,
  index,
  texCache,
}: {
  engine: (typeof ENGINES)[number];
  orbit: { radius: number; speed: number; phase: number; yOffset: number };
  index: number;
  texCache: TexCache;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(() => texCache.get(engine.name) ?? null);

  useEffect(() => {
    if (texCache.has(engine.name)) return;
    const svg = buildSvg('#ffffff', engine.path);
    let cancelled = false;
    svgToTexture(svg).then((tex) => {
      if (cancelled) return;
      texCache.set(engine.name, tex);
      setTexture(tex);
    });
    return () => {
      cancelled = true;
    };
  }, [engine.name, engine.path, texCache]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    const a = t * orbit.speed + orbit.phase;
    const x = Math.cos(a) * orbit.radius;
    const z = Math.sin(a) * orbit.radius;
    const y = orbit.yOffset + Math.sin(t * 0.4 + index * 1.5) * 0.5;
    groupRef.current.position.set(x, y, z);
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.005;
      meshRef.current.rotation.y += 0.01;
    }
  });

  const c = new THREE.Color(engine.color);

  return (
    <>
      {/* Orbital ring — stays in world space at fixed orbit, outside the moving group */}
      <mesh rotation-x={Math.PI / 2} position={[0, 0, 0]}>
        <ringGeometry args={[orbit.radius - 0.015, orbit.radius + 0.015, 48]} />
        <meshBasicMaterial color={engine.color} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      <group ref={groupRef}>
        {/* Icosahedron node at group origin — travels with the group */}
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[0.35, 0]} />
          <meshPhysicalMaterial
            color={c}
            emissive={c}
            emissiveIntensity={0.3}
            roughness={0.3}
            metalness={0.6}
            transparent
            opacity={0.9}
          />
        </mesh>

        {/* Wireframe overlay */}
        <mesh scale={1.4}>
          <icosahedronGeometry args={[0.35, 0]} />
          <meshBasicMaterial color={c} wireframe transparent opacity={0.15} />
        </mesh>

        {/* Icon sprite — inside the icosahedron, depthTest=false so it's not occluded by the faces */}
        {texture && (
          <sprite scale={[0.3, 0.3, 1]} position={[0, 0, 0]}>
            <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
          </sprite>
        )}
      </group>
    </>
  );
}

function TechRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.2;
  });
  return (
    <mesh ref={ref} rotation-x={Math.PI / 3}>
      <ringGeometry args={[5.8, 6, 64]} />
      <meshBasicMaterial color="#f59e0b" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function ScanRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.3;
  });
  return (
    <mesh ref={ref} rotation-x={Math.PI / 2}>
      <ringGeometry args={[3, 3.2, 48]} />
      <meshBasicMaterial color="#fbbf24" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// Per-node 3-point connection line (core origin → bend midpoint → node).
// The midpoint is updated every frame so the line dynamically tracks the node's orbit.
function ConnectionLines({ orbits }: { orbits: { radius: number; speed: number; phase: number; yOffset: number }[] }) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    for (let i = 0; i < orbits.length; i++) {
      const o = orbits[i];
      const a = t * o.speed + o.phase;
      const x = Math.cos(a) * o.radius;
      const z = Math.sin(a) * o.radius;
      const y = o.yOffset + Math.sin(t * 0.4 + i * 1.5) * 0.5;
      const line = ref.current.children[i] as THREE.Line;
      if (line) {
        const pos = line.geometry.attributes.position.array as Float32Array;
        const midX = x * 0.5;
        const midZ = z * 0.5;
        pos[0] = 0;
        pos[1] = 0;
        pos[2] = 0;
        pos[3] = midX;
        pos[4] = y * 0.5;
        pos[5] = midZ;
        pos[6] = x;
        pos[7] = y;
        pos[8] = z;
        line.geometry.attributes.position.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={ref}>
      {orbits.map((o) => (
        <line key={o.phase}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#f59e0b" transparent opacity={0.08} />
        </line>
      ))}
    </group>
  );
}

// Drifting particles that slowly spiral inward. When a particle passes within
// 1.5 units of the origin it respawns at a random point on the outer sphere,
// keeping the field dense at the perimeter.
function ParticleField() {
  const ref = useRef<THREE.Points>(null);
  const { positions, sizes } = particlePositions;

  useFrame(() => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const d = Math.sqrt(pos[i * 3] ** 2 + pos[i * 3 + 1] ** 2 + pos[i * 3 + 2] ** 2);
      const speed = 0.002 + sizes[i] * 0.05;
      pos[i * 3] *= 1 - speed;
      pos[i * 3 + 1] *= 1 - speed;
      pos[i * 3 + 2] *= 1 - speed;
      pos[i * 3 + 1] += Math.sin(d * 0.5 + sizes[i] * 10) * 0.001;
      if (d < 1.5) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 8 + Math.random() * 6;
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
        pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#f59e0b"
        transparent
        opacity={0.3}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

// Animated points that trail along changing orbital paths. Each particle has a
// stored phase offset used as both angle and radius seed, giving the group a
// varied-speed swarm appearance without per-particle state objects.
function DataFlowTrails() {
  const ref = useRef<THREE.Points>(null);
  const phasesRef = useRef(flowData.phases);
  const positions = flowData.positions;

  useFrame((_, delta) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    const phases = phasesRef.current;
    for (let i = 0; i < FLOW_COUNT; i++) {
      phases[i] += delta * (0.2 + (phases[i] % 0.3));
      const a = phases[i];
      const r = 3 + (phases[i] % 5);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a * 2) * 0.4;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.12}
        color="#fbbf24"
        transparent
        opacity={0.3}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function CoreNode() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * 0.3;
      ref.current.rotation.y += delta * 0.5;
    }
  });
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.06} />
      </mesh>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshPhysicalMaterial
          color="#fbbf24"
          emissive="#f59e0b"
          emissiveIntensity={0.6}
          metalness={0.4}
          roughness={0.15}
          transparent
          opacity={0.95}
        />
      </mesh>
      <mesh scale={1.6}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshBasicMaterial color="#fbbf24" wireframe transparent opacity={0.1} />
      </mesh>
    </group>
  );
}

function GridFloor() {
  return <gridHelper args={[20, 20, '#27273a', '#1a1a2e']} position={[0, -3.5, 0]} />;
}

function Stars() {
  const ref = useRef<THREE.Points>(null);
  const positions = STAR_POSITIONS;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#f59e0b"
        transparent
        opacity={0.2}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function Scene() {
  const orbits = useMemo(() => ORBIT_DATA, []);
  const [texCache] = useState(() => new Map() as TexCache);

  useEffect(() => {
    return () => {
      texCache.forEach((texture) => texture.dispose());
      texCache.clear();
    };
  }, [texCache]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 6, 4]} intensity={0.5} color="#f59e0b" />
      <pointLight position={[-4, -2, -6]} intensity={0.2} color="#f43f5e" />

      <GridFloor />
      <Stars />
      <TechRing />
      <ScanRing />
      <ConnectionLines orbits={orbits} />
      <DataFlowTrails />
      <ParticleField />

      {orbits.map((o, i) => (
        <TechNode key={i} engine={ENGINES[i]} orbit={o} index={i} texCache={texCache} />
      ))}

      <CoreNode />
    </>
  );
}

export default function HeroCanvas() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true">
      <Canvas camera={{ position: [0, 3, 11], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        <Scene />
      </Canvas>
    </div>
  );
}
