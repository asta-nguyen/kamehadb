import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '@tanstack/react-store';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { projectVectorsTo3d } from '@/lib/pca3d';
import { appStore } from '@/store';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BG_DARK = 0x0b0b0c;
const BG_LIGHT = 0xf8fafc;

export type VectorPoint = {
  readonly id: string | number;
  readonly vector: number[];
  readonly payload: Record<string, unknown>;
};

export const VECTOR_PALETTE = Array.from({ length: 10 }, (_, index) => `var(--vector-${index + 1})`);

// Three.js cannot parse CSS variables or OKLCH, so convert the shared token to
// linear sRGB before writing it into the GPU while the legend stays token-driven.
function setTokenColor(target: THREE.Color, color: string): void {
  const tokenMatch = color.match(/^var\((--[^)]+)\)$/);
  const resolved = tokenMatch
    ? getComputedStyle(document.documentElement).getPropertyValue(tokenMatch[1]).trim()
    : color;
  const oklchMatch = resolved.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!oklchMatch) {
    target.set(resolved);
    return;
  }

  const lightness = Number(oklchMatch[1]);
  const chroma = Number(oklchMatch[2]);
  const hue = (Number(oklchMatch[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);
  const clamp = (channel: number) => Math.max(0, Math.min(1, channel));

  target.setRGB(
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  );
}

export type LegendItem = { readonly value: string; readonly color: string };

type VectorMap3DProps = {
  readonly points: VectorPoint[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly header: ReactNode;
  readonly onPointClick: (point: VectorPoint) => void;
  readonly onCameraChange: (camera: {
    readonly position: [number, number, number];
    readonly target: [number, number, number];
  }) => void;
  readonly initialCamera?: { readonly position?: [number, number, number]; readonly target?: [number, number, number] };
  // Color-by support (optional — used by Qdrant vector map)
  readonly colorBy?: string;
  readonly onColorByChange?: (value: string) => void;
  readonly payloadKeys?: readonly string[];
  readonly colorValue?: (i: number) => string;
  readonly legend?: readonly LegendItem[];
};

export function VectorMap3D({
  points,
  isLoading,
  error,
  header,
  onPointClick,
  onCameraChange,
  initialCamera,
  colorBy,
  onColorByChange,
  payloadKeys,
  colorValue,
  legend,
}: VectorMap3DProps) {
  const theme = useStore(appStore, (state) => state.theme);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const mountRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<VectorPoint[]>([]);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const colorByRef = useRef(colorBy);
  const colorValueRef = useRef(colorValue);
  colorByRef.current = colorBy;
  colorValueRef.current = colorValue;
  // Capture initial camera on first render only, so camera saves don't re-create the scene
  const initialCameraRef = useRef(initialCamera);

  useEffect(() => {
    const syncTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, [theme]);

  pointsRef.current = points;

  const positions = useMemo(() => {
    if (points.length === 0) return null;
    return projectVectorsTo3d(
      points.map((point) => point.vector),
      100,
    );
  }, [points]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !positions) return;

    const cam = initialCameraRef.current;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? BG_DARK : BG_LIGHT);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 4000);
    if (cam?.position) {
      camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
    } else {
      camera.position.set(0, 0, 180);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    if (cam?.target) {
      controls.target.set(cam.target[0], cam.target[1], cam.target[2]);
      controls.update();
    }

    let saveCameraTimeout: ReturnType<typeof setTimeout>;
    const onControlsChange = () => {
      clearTimeout(saveCameraTimeout);
      saveCameraTimeout = setTimeout(() => {
        onCameraChange({
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
        });
      }, 500);
    };
    controls.addEventListener('change', onControlsChange);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Always allocate vertex colors so changing "Color by" only updates the
    // existing GPU buffer and never destroys the scene or resets the camera.
    const colors = new Float32Array(positions.length);
    const c = new THREE.Color();
    const colorCache = new Map<string, { r: number; g: number; b: number }>();
    for (let i = 0; i < pointsRef.current.length; i++) {
      const color = colorByRef.current && colorValueRef.current ? colorValueRef.current(i) : VECTOR_PALETTE[0];
      let rgb = colorCache.get(color);
      if (!rgb) {
        setTokenColor(c, color);
        rgb = { r: c.r, g: c.g, b: c.b };
        colorCache.set(color, rgb);
      }
      colors[i * 3] = rgb.r;
      colors[i * 3 + 1] = rgb.g;
      colors[i * 3 + 2] = rgb.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometryRef.current = geometry;

    const material = new THREE.PointsMaterial({ size: 3, sizeAttenuation: true, vertexColors: true });
    const cloud = new THREE.Points(geometry, material);
    scene.add(cloud);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 5 };
    const pointer = new THREE.Vector2();

    const updatePointer = (event: PointerEvent | MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      return rect;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(cloud)[0];
      if (hit?.index != null) {
        setHover({ i: hit.index, x: event.clientX - rect.left, y: event.clientY - rect.top });
      } else {
        setHover(null);
      }
    };

    const onClick = (event: MouseEvent) => {
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(cloud)[0];
      if (hit?.index == null) return;
      const point = pointsRef.current[hit.index];
      if (!point) return;
      onPointClick(point);
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

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = mount.clientWidth;
      const nextHeight = mount.clientHeight;
      if (!nextWidth || !nextHeight) return;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      controls.removeEventListener('change', onControlsChange);
      clearTimeout(saveCameraTimeout);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [positions]);

  // Theme changes only update the existing scene background, preserving the
  // camera and controls instead of recreating the complete WebGL scene.
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(isDark ? BG_DARK : BG_LIGHT);
    }
  }, [isDark]);

  // Reactively re-tint the geometry when colorBy changes (no full scene rebuild).
  useEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry || !colorValue) return;
    const attr = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const c = new THREE.Color();
    const colorCache = new Map<string, { r: number; g: number; b: number }>();
    for (let i = 0; i < points.length; i++) {
      const color = colorBy ? colorValue(i) : VECTOR_PALETTE[0];
      let rgb = colorCache.get(color);
      if (!rgb) {
        setTokenColor(c, color);
        rgb = { r: c.r, g: c.g, b: c.b };
        colorCache.set(color, rgb);
      }
      attr.setXYZ(i, rgb.r, rgb.g, rgb.b);
    }
    attr.needsUpdate = true;
  }, [colorBy, points, colorValue, isDark]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!positions || points.length < 2) {
    return <EmptyState title="Need at least 2 vectors to visualize" />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border flex items-center gap-3 text-xs">
        {header}
        <span className="text-muted-foreground ml-auto">{points.length} vectors (PCA → 3D)</span>
        {onColorByChange && (
          <Label className="flex items-center gap-1 text-muted-foreground">
            Color by
            <Select
              value={colorBy || '_none'}
              onValueChange={(v) => onColorByChange(v === '_none' || v == null ? '' : v)}
            >
              <SelectTrigger size="sm" className="h-6 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">none</SelectItem>
                {payloadKeys?.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
        )}
      </div>
      {legend && legend.length > 0 && (
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
            <div className="text-muted-foreground/60 mt-1">click → search from this vector</div>
          </div>
        )}
        <div className="absolute bottom-2 left-3 text-xs text-muted-foreground/70 pointer-events-none">
          drag to rotate · scroll to zoom · right-drag to pan
        </div>
      </div>
    </div>
  );
}
