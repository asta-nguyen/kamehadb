import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WorkspaceTab } from '@kamehadb/shared';
import { api } from '@/lib/api';
import { appStore, openQdrantSearchTab, updateTabQdrantGraphState } from '@/store';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const BG_DARK = 0x0b0b0c;
const BG_LIGHT = 0xf8fafc;

interface QdrantVectorMapProps {
  tab: WorkspaceTab & { type: 'qdrant-graph' };
  connectionId: string;
  collection: string;
  vectorName?: string;
}

const SAMPLE_LIMIT = 500;
const PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
];
const SPREAD = 100;

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function normalize(v: number[]): void {
  const n = Math.sqrt(dot(v, v)) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
}

function pca3d(vectors: number[][]): [number, number, number][] {
  const n = vectors.length;
  const d = vectors[0].length;
  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const X = vectors.map((v) => v.map((x, j) => x - mean[j]));

  const topComponent = (exclude: number[][]): number[] => {
    let v = new Array(d).fill(0).map((_, i) => Math.sin(i + 1));
    normalize(v);
    for (let iter = 0; iter < 50; iter++) {
      const u = X.map((row) => dot(row, v));
      const w = new Array(d).fill(0);
      for (let i = 0; i < n; i++) {
        const ui = u[i];
        const row = X[i];
        for (let j = 0; j < d; j++) w[j] += row[j] * ui;
      }
      for (const e of exclude) {
        const p = dot(w, e);
        for (let j = 0; j < d; j++) w[j] -= p * e[j];
      }
      normalize(w);
      v = w;
    }
    return v;
  };

  const pc1 = topComponent([]);
  const pc2 = topComponent([pc1]);
  const pc3 = topComponent([pc1, pc2]);
  return X.map((row) => [dot(row, pc1), dot(row, pc2), dot(row, pc3)]);
}

function toNumericVector(vector: unknown, vectorName?: string): number[] | null {
  if (Array.isArray(vector) && typeof vector[0] === 'number') return vector as number[];
  if (vector && typeof vector === 'object') {
    const obj = vector as Record<string, unknown>;
    if (vectorName && vectorName in obj) {
      const v = obj[vectorName];
      if (Array.isArray(v) && typeof v[0] === 'number') return v as number[];
    }
    if (!vectorName) {
      const keys = Object.keys(obj);
      if (keys.length === 1) {
        const v = obj[keys[0]];
        if (Array.isArray(v) && typeof v[0] === 'number') return v as number[];
      }
    }
  }
  return null;
}

type Point = { id: string | number; payload: Record<string, unknown>; vector: number[] };

export function QdrantVectorMap({ tab, connectionId, collection, vectorName }: QdrantVectorMapProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['qdrant-map', connectionId, collection],
    queryFn: () =>
      api.scrollQdrantPoints(connectionId, {
        collection,
        limit: SAMPLE_LIMIT,
        withPayload: true,
        withVector: true,
      }),
    staleTime: 30000,
  });

  const [colorBy, setColorBy] = useState<string>(tab.colorBy || '');
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  useEffect(() => {
    updateTabQdrantGraphState(tab.id, { colorBy });
  }, [tab.id, colorBy]);

  const theme = useStore(appStore, (s) => s.theme);
  const isDark = useMemo(() => document.documentElement.classList.contains('dark'), [theme]);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const colorByRef = useRef(colorBy);
  colorByRef.current = colorBy;
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  const points = useMemo<Point[]>(() => {
    if (!data) return [];
    return data.points
      .map((p) => ({ id: p.id, payload: p.payload ?? {}, vector: toNumericVector(p.vector, vectorName) }))
      .filter((p): p is Point => !!p.vector);
  }, [data]);
  pointsRef.current = points;

  const payloadKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of points) for (const k of Object.keys(p.payload)) keys.add(k);
    return [...keys];
  }, [points]);

  const positions = useMemo(() => {
    if (points.length < 2) return null;
    const coords = pca3d(points.map((p) => p.vector));
    const mins = [Infinity, Infinity, Infinity];
    const maxs = [-Infinity, -Infinity, -Infinity];
    for (const c of coords)
      for (let a = 0; a < 3; a++) {
        mins[a] = Math.min(mins[a], c[a]);
        maxs[a] = Math.max(maxs[a], c[a]);
      }
    const center = [0, 1, 2].map((a) => (mins[a] + maxs[a]) / 2);
    const range = Math.max(...[0, 1, 2].map((a) => maxs[a] - mins[a]), 1e-6);
    const scale = SPREAD / range;
    const arr = new Float32Array(coords.length * 3);
    coords.forEach((c, i) => {
      arr[i * 3] = (c[0] - center[0]) * scale;
      arr[i * 3 + 1] = (c[1] - center[1]) * scale;
      arr[i * 3 + 2] = (c[2] - center[2]) * scale;
    });
    return arr;
  }, [points]);

  const { legend, colorValue } = useMemo(() => {
    if (!colorBy) return { legend: [] as { value: string; color: string }[], colorValue: () => PALETTE[0] };
    const values = [...new Set(points.map((p) => String(p.payload[colorBy] ?? '∅')))];
    const map = new Map(values.map((v, i) => [v, PALETTE[i % PALETTE.length]]));
    return {
      legend: values.slice(0, 12).map((v) => ({ value: v, color: map.get(v)! })),
      colorValue: (i: number) => map.get(String(points[i].payload[colorBy] ?? '∅')) ?? PALETTE[0],
    };
  }, [colorBy, points]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !positions) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDarkRef.current ? BG_DARK : BG_LIGHT);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 4000);
    if (tab.camera) {
      camera.position.set(tab.camera.position[0], tab.camera.position[1], tab.camera.position[2]);
    } else {
      camera.position.set(0, 0, SPREAD * 1.8);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    if (tab.camera?.target) {
      controls.target.set(tab.camera.target[0], tab.camera.target[1], tab.camera.target[2]);
      controls.update();
    }

    let saveCameraTimeout: ReturnType<typeof setTimeout>;
    const onControlsChange = () => {
      clearTimeout(saveCameraTimeout);
      saveCameraTimeout = setTimeout(() => {
        updateTabQdrantGraphState(tab.id, {
          camera: {
            position: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
          },
        });
      }, 500);
    };
    controls.addEventListener('change', onControlsChange);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const colors = new Float32Array(positions.length);
    const c = new THREE.Color();
    for (let i = 0; i < pointsRef.current.length; i++) {
      c.set(colorByRef.current ? colorValue(i) : PALETTE[0]);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometryRef.current = geometry;

    const material = new THREE.PointsMaterial({ size: 3, sizeAttenuation: true, vertexColors: true });
    const cloud = new THREE.Points(geometry, material);
    scene.add(cloud);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 5 };
    const pointer = new THREE.Vector2();

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(cloud)[0];
      if (hit && hit.index != null) {
        setHover({ i: hit.index, x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setHover(null);
      }
    };
    const onClick = () => {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(cloud)[0];
      if (hit && hit.index != null) {
        const p = pointsRef.current[hit.index];
        if (p) openQdrantSearchTab(connectionId, collection, { mode: 'similar', pointId: p.id });
      }
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    return () => {
      // Ensure final camera state is saved on unmount (e.g., if switching tabs during debounce)
      updateTabQdrantGraphState(tab.id, {
        camera: {
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
        },
      });

      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      controls.removeEventListener('change', onControlsChange);
      clearTimeout(saveCameraTimeout);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      geometryRef.current = null;
      sceneRef.current = null;
    };
  }, [positions, connectionId, collection]);

  useEffect(() => {
    const bg = sceneRef.current?.background;
    if (bg instanceof THREE.Color) bg.set(isDark ? BG_DARK : BG_LIGHT);
  }, [isDark]);

  useEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const attr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < points.length; i++) {
      c.set(colorBy ? colorValue(i) : PALETTE[0]);
      attr.setXYZ(i, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
  }, [colorBy, points, colorValue]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load vectors'}
      </div>
    );
  }
  if (points.length < 2 || !positions) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Need at least 2 points with vectors to visualize
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border flex items-center gap-3 text-xs">
        <span className="font-mono">{collection}</span>
        <span className="text-muted-foreground">{points.length} points (PCA → 3D)</span>
        <Label className="flex items-center gap-1 ml-auto text-muted-foreground">
          Color by
          <Select value={colorBy || '_none'} onValueChange={(v) => setColorBy(v === '_none' || v == null ? '' : v)}>
            <SelectTrigger size="sm" className="h-6 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">none</SelectItem>
              {payloadKeys.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
      </div>

      {legend.length > 0 && (
        <div className="px-3 py-1.5 border-b border-border flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {legend.map((l) => (
            <span key={l.value} className="flex items-center gap-1 text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
              {l.value}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        <div ref={mountRef} className="absolute inset-0" />
        {hover && pointsRef.current[hover.i] && (
          <div
            className="absolute pointer-events-none bg-popover border border-border rounded-md shadow-md p-2 text-xs max-w-64 z-10"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            <div className="font-mono text-muted-foreground mb-1">id: {String(pointsRef.current[hover.i].id)}</div>
            <pre className="font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(pointsRef.current[hover.i].payload, null, 2)}
            </pre>
            <div className="text-muted-foreground/60 mt-1">click → find similar</div>
          </div>
        )}
        <div className="absolute bottom-2 left-3 text-xs text-muted-foreground/70 pointer-events-none">
          drag to rotate · scroll to zoom · right-drag to pan
        </div>
      </div>
    </div>
  );
}
