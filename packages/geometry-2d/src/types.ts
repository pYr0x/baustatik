export interface Transformable<T> {
  translate(shape: T, vector: { dx: number; dy: number }): T
  rotate(shape: T, angle: number, origin?: { x: number; y: number }): T
  mirror(shape: T, axisP1: { x: number; y: number }, axisP2: { x: number; y: number }): T
}

export type BoundingBox = {
  min: { x: number; y: number }
  max: { x: number; y: number }
}

export function closestPointOnSegment(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p: { x: number; y: number }
): { x: number; y: number } {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { x: p1.x, y: p1.y }
  const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq))
  return { x: p1.x + t * dx, y: p1.y + t * dy }
}

export function normalizeAngle(angle: number): number {
  return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
}

export function angleInArc(angle: number, startAngle: number, sweep: number, tolerance = 1e-10): boolean {
  if (sweep >= 2 * Math.PI - tolerance) return true
  const a = normalizeAngle(angle - startAngle)
  return a <= sweep + tolerance
}

export function sweepAngle(startAngle: number, endAngle: number): number {
  const diff = endAngle - startAngle
  if (Math.abs(diff) < 1e-10) return 0
  const raw = ((diff % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return raw < 1e-10 ? 2 * Math.PI : raw
}
