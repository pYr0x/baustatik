/**
 * Die Farbskalen der Spannungsdarstellung — EINE Quelle für das SVG-Feld und
 * das 3D-Relief. Zwei Maschinen für eine Frage dürfen nicht verschieden
 * färben: dieselbe Zahl muss auf beiden Bildern dieselbe Farbe haben.
 */

export type Rgb = readonly [number, number, number];
export type Range = { readonly min: number; readonly max: number };

export type ColorScale = {
  /** Normiert einen Wert auf [0, 1] innerhalb der gegebenen Spanne. */
  readonly normalize: (value: number, range: Range) => number;
  readonly stops: readonly Rgb[];
};

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Blau (Druck) über Weiß nach Rot (Zug), symmetrisch um Null. */
const DIVERGING_STOPS = [
  '#2166ac',
  '#4393c3',
  '#92c5de',
  '#f7f7f7',
  '#f4a582',
  '#d6604d',
  '#b2182b',
].map(hexToRgb);
/** Viridis für Beträge: dunkelblau (klein) nach gelb (groß). */
const SEQUENTIAL_STOPS = [
  '#440154',
  '#46327e',
  '#365c8d',
  '#277f8e',
  '#1fa187',
  '#4ac16d',
  '#a0da39',
  '#fde725',
].map(hexToRgb);

export const DIVERGING_SCALE: ColorScale = {
  stops: DIVERGING_STOPS,
  // SYMMETRISCH UM NULL: Weiß liegt bei σ = 0, auch wenn die Spanne
  // unsymmetrisch ist — sonst läge die Nulllinie farblich daneben.
  // ENTARTETE SPANNE (alle Werte null, leere Eingabe): eine Farbe, kein NaN.
  normalize: (value, range) => {
    const maxAbs = Math.max(Math.abs(range.min), Math.abs(range.max));
    return maxAbs === 0 ? 0 : clamp01(0.5 + value / (2 * maxAbs));
  },
};

export const SEQUENTIAL_SCALE: ColorScale = {
  stops: SEQUENTIAL_STOPS,
  normalize: (value, range) => {
    const width = range.max - range.min;
    return width <= 0 ? 0 : clamp01((value - range.min) / width);
  },
};

export function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** Ein CSS-rgb()-String an der Stelle t der Skala — für SVG-Fills und Legenden. */
export function sampleColor(stops: readonly Rgb[], t: number): string {
  const scaled = t * (stops.length - 1);
  const index = Math.min(Math.floor(scaled), stops.length - 2);
  const fraction = scaled - index;
  const a = stops[index]!;
  const b = stops[index + 1]!;
  const mix = (channel: number): number => {
    const ca = a[channel];
    const cb = b[channel];
    return Math.round(ca + (cb - ca) * fraction);
  };
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
}

export function legendGradientCss(stops: readonly Rgb[]): string {
  const parts = stops.map((c, i) => {
    const offset = (i / (stops.length - 1)) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${offset.toFixed(1)}%`;
  });
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
