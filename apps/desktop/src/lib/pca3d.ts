export function projectVectorsTo3d(vectors: number[][], spread = 100): Float32Array | null {
  const count = vectors.length;
  if (count < 2) return null;

  const dims = vectors[0]?.length ?? 0;
  if (dims === 0) return null;

  const mean = new Array<number>(dims).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dims; i++) mean[i] += vector[i];
  }
  for (let i = 0; i < dims; i++) mean[i] /= count;

  const centered = vectors.map((vector) => vector.map((value, i) => value - mean[i]));

  const basis: number[][] = [];
  for (let component = 0; component < Math.min(3, dims); component++) {
    let direction: number[] = Array.from({ length: dims }, (_, i) => (i === component ? 1 : 0));
    for (let iteration = 0; iteration < 24; iteration++) {
      const next = new Array<number>(dims).fill(0);
      for (const vector of centered) {
        let projection = 0;
        for (let i = 0; i < dims; i++) projection += vector[i] * direction[i];
        for (let i = 0; i < dims; i++) {
          next[i] += vector[i] * projection;
        }
      }
      for (const prior of basis) {
        const dot = next.reduce((sum, value, i) => sum + value * prior[i], 0);
        for (let i = 0; i < dims; i++) next[i] -= dot * prior[i];
      }
      const magnitude = Math.hypot(...next) || 1;
      direction = next.map((value) => value / magnitude);
    }
    basis.push(direction);
  }

  while (basis.length < 3) {
    basis.push(new Array<number>(dims).fill(0));
  }

  const projected = centered.map((vector) =>
    basis.map((axis) => vector.reduce((sum, value, i) => sum + value * axis[i], 0)),
  );
  const maxAbs = projected.reduce((max, coords) => Math.max(max, ...coords.map((value) => Math.abs(value))), 0);
  const scale = maxAbs > 0 ? spread / maxAbs : 1;

  const positions = new Float32Array(projected.length * 3);
  projected.forEach((coords, i) => {
    positions[i * 3] = coords[0] * scale;
    positions[i * 3 + 1] = coords[1] * scale;
    positions[i * 3 + 2] = coords[2] * scale;
  });
  return positions;
}
