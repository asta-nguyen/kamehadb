export function simpleEmbed(text: string, dims: number): number[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const vec = new Array(dims).fill(0);
  for (const word of words) {
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = (h << 5) - h + word.charCodeAt(i);
      h |= 0;
    }
    const idx = ((h % dims) + dims) % dims;
    vec[idx] += 1;
  }
  if (words.length === 0) return vec;
  const mag = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / mag);
}
