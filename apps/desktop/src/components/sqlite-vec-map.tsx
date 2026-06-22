import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@tanstack/react-store';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WorkspaceTab } from '@kamehadb/shared';
import { useSqliteVecVectorsSample } from '@/hooks/use-sqlite-vec';
import { projectVectorsTo3d } from '@/lib/pca3d';
import { appStore, openSqliteVecSearchTab, updateTabSqliteVecMapState } from '@/store';
import { Loader2 } from 'lucide-react';

const BG_DARK = 0x0b0b0c;
const BG_LIGHT = 0xf8fafc;

type SqliteVecMapProps = {
  readonly tab: Extract<WorkspaceTab, { type: 'sqlite-vec-map' }>;
  readonly connectionId: string;
};

type Point = {
  readonly id: string | number;
  readonly vector: number[];
  readonly payload: Record<string, unknown>;
};

export function SqliteVecMap({ tab, connectionId }: SqliteVecMapProps) {
  const { data, isLoading, error } = useSqliteVecVectorsSample(connectionId, {
    table: tab.table,
    column: tab.column,
    limit: 500,
  });
  const theme = useStore(appStore, (state) => state.theme);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const mountRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

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

  const points = useMemo<Point[]>(() => {
    return (data?.points ?? []).filter((point) => point.vector.length > 0);
  }, [data]);
  pointsRef.current = points;

  const positions = useMemo(() => {
    return projectVectorsTo3d(
      points.map((point) => point.vector),
      100,
    );
  }, [points]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !positions) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? BG_DARK : BG_LIGHT);
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 4000);
    if (tab.camera) {
      camera.position.set(tab.camera.position[0], tab.camera.position[1], tab.camera.position[2]);
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
    if (tab.camera?.target) {
      controls.target.set(tab.camera.target[0], tab.camera.target[1], tab.camera.target[2]);
      controls.update();
    }

    let saveCameraTimeout: ReturnType<typeof setTimeout>;
    const onControlsChange = () => {
      clearTimeout(saveCameraTimeout);
      saveCameraTimeout = setTimeout(() => {
        updateTabSqliteVecMapState(tab.id, {
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
    const material = new THREE.PointsMaterial({ size: 3, sizeAttenuation: true, color: '#3b82f6' });
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
      openSqliteVecSearchTab(connectionId, {
        table: tab.table,
        column: tab.column,
        mode: 'similar',
        vectorText: JSON.stringify(point.vector),
      });
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
    };
  }, [connectionId, isDark, positions, tab.id, tab.camera, tab.table, tab.column]);

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

  if (!positions || points.length < 2) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Need at least 2 vectors to visualize
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border flex items-center gap-3 text-xs">
        <span className="font-mono">{tab.table}</span>
        <span className="text-muted-foreground">{tab.column}</span>
        <span className="text-muted-foreground ml-auto">{points.length} vectors (PCA → 3D)</span>
      </div>
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
