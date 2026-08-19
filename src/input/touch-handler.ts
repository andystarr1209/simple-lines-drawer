// ============================================================
// Touch Handler - pinch-zoom, pan via touch gestures
// ============================================================

import type { LineStore } from '@/store';
import type { Renderer } from '@/rendering/renderer';

type Invalidate = () => void;

interface TouchInfo {
  id: number;
  initialX: number;
  initialY: number;
}

export function attachTouchHandlers(
  canvas: HTMLCanvasElement,
  store: LineStore,
  _renderer: Renderer,
  invalidate: Invalidate,
  onZoomChanged?: (scale: number) => void,
): () => void {
  const touches = new Map<number, TouchInfo>();

  const onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      touches.set(t.identifier, {
        id: t.identifier,
        initialX: t.clientX - rect.left,
        initialY: t.clientY - rect.top,
      });
    }
  };

  const onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();

    if (touches.size === 1) {
      const touch = e.touches[0];
      if (!touch) return;
      const info = touches.get(touch.identifier);
      if (!info) return;
      const rect = canvas.getBoundingClientRect();
      const cx = touch.clientX - rect.left;
      const cy = touch.clientY - rect.top;
      store.setCamera({
        offsetX: store.state.camera.offsetX + (cx - info.initialX),
        offsetY: store.state.camera.offsetY + (cy - info.initialY),
      });
      touches.set(touch.identifier, { ...info, initialX: cx, initialY: cy });
      invalidate();
    } else if (touches.size >= 2) {
      const ids = Array.from(touches.keys()).slice(0, 2);
      const t1Idx = e.touches.length > 0 ? [...e.touches].findIndex((t) => t.identifier === ids[0]) : -1;
      const t2Idx = e.touches.length > 1 ? [...e.touches].findIndex((t) => t.identifier === ids[1]) : -1;
      if (t1Idx < 0 || t2Idx < 0) return;

      const rect = canvas.getBoundingClientRect();
      const x1 = e.touches[t1Idx].clientX - rect.left;
      const y1 = e.touches[t1Idx].clientY - rect.top;
      const x2 = e.touches[t2Idx].clientX - rect.left;
      const y2 = e.touches[t2Idx].clientY - rect.top;
      const i0 = touches.get(ids[0])!;
      const i1 = touches.get(ids[1])!;
      const initDist = Math.sqrt((i1.initialX - i0.initialX) ** 2 + (i1.initialY - i0.initialY) ** 2);
      if (initDist < 50) return;

      const curDist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (curDist < 50) return;

      store.zoomAtCursor(curDist / initDist, (x1 + x2) / 2, (y1 + y2) / 2);
      invalidate();
      if (onZoomChanged) {
        onZoomChanged(store.state.camera.scale);
      }
    }
  };

  const onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      touches.delete(e.changedTouches[i].identifier);
    }
  };

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

  return (): void => {
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('touchcancel', onTouchEnd);
  };
}
