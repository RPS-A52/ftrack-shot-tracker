import type { Series } from '../data/aggregate';

export const AXIS_SPACE = 28;
const LABEL_FONT = '12px "Open Sans", "Segoe UI", sans-serif';

let measureCanvas: HTMLCanvasElement | null = null;
export function textWidth(text: string) {
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = LABEL_FONT;
  return ctx.measureText(text).width;
}

export function truncate(text: string, maxWidth: number) {
  if (textWidth(text) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(text.slice(0, mid) + '…') <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, Math.max(1, lo)) + '…';
}

/** Label column: as wide as the longest name, but never more than a third of the space. */
export function labelWidthFor(labels: string[], width: number) {
  const longest = labels.reduce((max, l) => Math.max(max, textWidth(l)), 0);
  return Math.round(Math.min(Math.max(longest + 16, 60), Math.max(width * 0.33, 80), 240));
}

export type Slice = { id: string; value: number; label: string; color: string };

export function slices(values: Record<string, number>, series: Series[], hidden: Set<string>): Slice[] {
  return series
    .filter((s) => !hidden.has(s.key) && (values[s.key] ?? 0) > 0)
    .map((s) => ({ id: s.key, value: values[s.key], label: s.label, color: s.color }));
}
