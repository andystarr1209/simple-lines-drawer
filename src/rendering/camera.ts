// ============================================================
// Camera helpers — zoom toward cursor, grid bounds calculation
// ============================================================

import type { CameraState, Viewport } from '@/types';
import { GRID_COLOR, GRID_MAJOR_INTERVAL, GRID_MINOR_COUNT } from '@/constants';

/** Zoom toward a screen-space point: compute new camera after scale change */
export function computeZoomAt(
  oldCamera: CameraState,
  newScale: number,
  screenX: number,
  screenY: number,
): CameraState {
  if (newScale <= 0) return oldCamera;
  const factor = newScale / oldCamera.scale;
  return {
    scale: newScale,
    offsetX: screenX - (screenX - oldCamera.offsetX) * factor,
    offsetY: screenY - (screenY - oldCamera.offsetY) * factor,
  };
}

/** Clamp camera offset so viewport doesn't drift too far from origin */
export function clampCamera(camera: CameraState, maxOffset: number): CameraState {
  return {
    ...camera,
    offsetX: Math.max(-maxOffset, Math.min(maxOffset, camera.offsetX)),
    offsetY: Math.max(-maxOffset, Math.min(maxOffset, camera.offsetY)),
  };
}

/**
 * Given a camera and viewport, compute the visible canvas-space bounds.
 * Returns { minX, minY, maxX, maxY } in canvas coordinates.
 */
export function getVisibleCanvasBounds(camera: CameraState, viewport: Viewport): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const invScale = 1 / camera.scale;
  return {
    minX: (camera.offsetX) * invScale,
    minY: (camera.offsetY) * invScale,
    maxX: (camera.offsetX + viewport.width) * invScale,
    maxY: (camera.offsetY + viewport.height) * invScale,
  };
}

/**
 * Calculate grid cell size for the current zoom level.
 * At low zoom, use major intervals; at high zoom, subdivide to maintain visual density.
 */
export function getGridCellSize(camera: CameraState): number {
  const screenPixelPerUnit = camera.scale;
  // Target roughly 50-100px grid lines
  let cellSize = GRID_MAJOR_INTERVAL;

  // Subdivide or subdivide further based on zoom
  while (cellSize * screenPixelPerUnit > 200) {
    cellSize /= Math.pow(10, Math.ceil(Math.log10(GRID_MINOR_COUNT + 1)));
  }
  while (cellSize * screenPixelPerUnit < 30) {
    cellSize *= 10;
  }

  return cellSize;
}

/**
 * Get grid configuration for the current camera state.
 * Returns minor and major intervals in canvas units.
 */
export function getGridConfig(camera: CameraState): {
  minorStep: number;
  majorStep: number;
  minorColor: string;
  majorColor: string;
} {
  const cellSize = getGridCellSize(camera);
  const minorSteps = Math.max(1, Math.floor(GRID_MINOR_COUNT));
  return {
    minorStep: cellSize / minorSteps,
    majorStep: cellSize,
    minorColor: 'rgba(255, 255, 255, 0.03)',
    majorColor: GRID_COLOR,
  };
}
