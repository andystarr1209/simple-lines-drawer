// ============================================================
// Vector math helpers — coords, angles, distances, rotation
// ============================================================

import type { Point } from '@/types';

export function screenToCanvas(px: number, py: number, scale: number, offsetX: number, offsetY: number): Point {
  return { x: (px - offsetX) / scale, y: (py - offsetY) / scale };
}

export function canvasToScreen(cx: number, cy: number, scale: number, offsetX: number, offsetY: number): Point {
  return { x: cx * scale + offsetX, y: cy * scale + offsetY };
}

export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleBetween(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function rotatePoint(point: Point, center: Point, angleRad: number): Point {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos),
  };
}

export function scalePoint(point: Point, center: Point, factor: number): Point {
  return {
    x: center.x + (point.x - center.x) * factor,
    y: center.y + (point.y - center.y) * factor,
  };
}

/** Euclidean distance from point `p` to segment [a, b] */
export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Hit-test: is the cursor near the line segment? */
export function isPointNearLine(p: Point, lineStart: Point, lineEnd: Point, threshold: number): boolean {
  return distancePointToSegment(p, lineStart, lineEnd) <= threshold;
}

/** Get the nearest handle ('start' | 'end' | 'rotate') on a selected line, or null */
export function getNearestHandle(
  mousePos: Point,
  startHandle: Point,
  endHandle: Point,
  rotationHandle: Point,
  hitThreshold: number,
): 'start' | 'end' | 'rotate' | null {
  if (distance(mousePos, startHandle) <= hitThreshold) return 'start';
  if (distance(mousePos, endHandle) <= hitThreshold) return 'end';
  if (distance(mousePos, rotationHandle) <= hitThreshold) return 'rotate';
  return null;
}

/** Clamp mouse movement to the line's axis for resize */
export function clampToLineAxis(
  mousePos: Point,
  pivot: Point,      // the handle being dragged
  oppositeEnd: Point, // the fixed end of the line
): Point {
  const dx = oppositeEnd.x - pivot.x;
  const dy = oppositeEnd.y - pivot.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return mousePos;

  let t = ((mousePos.x - pivot.x) * dx + (mousePos.y - pivot.y) * dy) / lenSq;
  t = Math.max(0, t);

  return { x: pivot.x + dx * t, y: pivot.y + dy * t };
}
