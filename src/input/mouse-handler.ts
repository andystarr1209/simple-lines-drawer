// ============================================================
// Mouse Handler - registers canvas mouse events, delegates by tool mode
// ============================================================

import type { LineStore } from '@/store';
import type { Renderer } from '@/rendering/renderer';

/** Callback invoked when renderer needs to know the hovered line */
export interface InputCallbacks {
  /** Called during draw preview (drag while drawing) */
  onDrawPreview(canvasX: number, canvasY: number): void;
  /** Called when a new line is finalized in draw mode */
  onLineFinalized(id: string): void;
  /** Called with current cursor position in canvas space for status display */
  onCursorMove(canvasX: number, canvasY: number): void;
  /** Called for hit-testing and selection state changes */
  onSelectChange(): void;
  /** Called with the hovered line id (or null) to update cursor style */
  onHover(lineId: string | null, isOnHandle: boolean): void;
  /** Called after zoom operations to update UI label */
  onZoomChanged(scale: number): void;
}

/** Callback that the mouse handler calls to signal render needs update */
type Invalidate = () => void;

/**
 * Attach mouse listeners to a canvas element.
 * Returns a dispose function to remove all listeners.
 */
export function attachMouseHandlers(
  canvas: HTMLCanvasElement,
  store: LineStore,
  renderer: Renderer,
  callbacks: InputCallbacks,
  invalidate: Invalidate,
): () => void {
  let isDrawing = false;
  let drawStart: { x: number; y: number } | null = null;
  let isMultiSelecting = false;
  let multiSelectStart: { x: number; y: number } | null = null;
  let multiSelectScreenPos: { sx: number; sy: number } | null = null;

  // Multi-line drag state (Phase 6)
  let isDraggingLines = false;
  let dragStartScreen: { sx: number; sy: number } | null = null;

  /** Convert event to screen-space coords relative to canvas */
  function screen(e: MouseEvent): { sx: number; sy: number } {
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  /** Convert screen coords to canvas-space */
  function canvasPt(sx: number, sy: number): { x: number; y: number } {
    return renderer.screenToCanvas(sx, sy);
  }

  const onMouseMove = (e: MouseEvent): void => {
    const { sx, sy } = screen(e);
    renderer.setHoverTarget(sx, sy);
      callbacks.onCursorMove(renderer.screenToCanvas(sx, sy).x, renderer.screenToCanvas(sx, sy).y);

    if (isMultiSelecting && multiSelectStart) {
      // Draw selection rectangle visualization (handled by re-render)
      invalidate();
      return;
    }

    // Phase 6: Handle pending transform drag
    if (isDraggingLines && dragStartScreen && store.state.pendingTransform) {
      const dx = sx - dragStartScreen.sx;
      const dy = sy - dragStartScreen.sy;
      store.updatePendingTransform(dx, dy, store.state.camera.scale);
      // Track selection rect for visual feedback
      const x1 = dragStartScreen.sx;
      const y1 = dragStartScreen.sy;
      const x2 = sx;
      const y2 = sy;
      store.setDragRectScreen({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) });
      invalidate();
      return;
    }

    if (isDrawing && drawStart) {
      const pt = canvasPt(sx, sy);
      const lineId = store.state.activeLineId;
      if (lineId) {
        const line = store.state.lines.get(lineId);
        if (line) { line.end = { x: pt.x, y: pt.y }; }
      }
      callbacks.onDrawPreview(pt.x, pt.y);
    }

    // Cursor update on hover
    const hoveredLineId = renderer.getHoveredLineId();
    let isOnHandle = false;
    if (hoveredLineId) {
      const hit = renderer.findNearestHandleToScreen(sx, sy);
      isOnHandle = hit !== null;
    }
    callbacks.onHover(hoveredLineId, isOnHandle);

    invalidate();
  };

  const onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return; // only left click
    const { sx, sy } = screen(e);
    const mode = store.state.toolMode;

    if (mode === 'draw_line') {
      isDrawing = true;
      drawStart = canvasPt(sx, sy);
      const id = store.addLine(drawStart.x, drawStart.y, drawStart.x, drawStart.y);
      store.setActiveLine(id);
      invalidate();
    } else if (mode === 'select') {
      // Try handle hit first
      const hit = renderer.findNearestHandleToScreen(sx, sy);
      if (hit) {
        if (hit.side === 'rotate') {
          store.startRotate(hit.lineId, sx, sy);
        } else {
          const cp = canvasPt(sx, sy);
          store.startResize(hit.lineId, hit.side, cp.x, cp.y);
        }
      } else {
        // Hit-test lines
        const nearest = renderer.findNearestLineToScreen(sx, sy);
        if (nearest) {
          store.setActiveLine(nearest);
          if (e.shiftKey) {
            // Toggle selection for this line
            if (store.state.selectedLines.has(nearest)) store.state.selectedLines.delete(nearest);
            else store.state.selectedLines.add(nearest);
          } else {
            store.clearSelection();
            store.state.selectedLines.add(nearest);
          }
          callbacks.onSelectChange();

          // Phase 6: Start pending transform for multi-line drag
          if (store.state.selectedLines.size >= 1) {
            isDraggingLines = true;
            dragStartScreen = { sx, sy };
            const canvasPos = canvasPt(sx, sy);
            store.startPendingTransform([...store.state.selectedLines], canvasPos.x, canvasPos.y);
          }
        } else if (e.shiftKey) {
          // Start multi-select drag from empty canvas
          isMultiSelecting = true;
          multiSelectStart = { x: sx, y: sy };
          multiSelectScreenPos = { sx, sy };
        } else {
          // Click on empty canvas - deselect
          store.clearSelection();
          store.setActiveLine(null);
          callbacks.onSelectChange();
        }
      }
      invalidate();
    }
  };

  const onMouseUp = (e: MouseEvent): void => {
    if (isDrawing) {
      isDrawing = false;
      if (drawStart) {
        const id = store.state.activeLineId;
        if (id) {
          const line = store.state.lines.get(id);
          if (line && (Math.abs(line.end.x - line.start.x) > 0.5 || Math.abs(line.end.y - line.start.y) > 0.5)) {
            // Snap endpoints to grid if snap is enabled
            if (store.state.snapToGrid) {
              const rect = canvas.getBoundingClientRect();
              const currentScreenX = e.clientX - rect.left;
              const currentScreenY = e.clientY - rect.top;
              const snapped = store.snappedEndpoints(drawStart.x, drawStart.y, currentScreenX, currentScreenY);
              if (snapped) {
                line.start = { x: snapped.startX, y: snapped.startY };
                line.end = { x: snapped.endX, y: snapped.endY };
              }
            }
            callbacks.onLineFinalized(id);
          } else {
            // Zero-length - delete it as it's just a dot
            store.deleteLine(id);
            store.setActiveLine(null);
          }
        }
      }
      drawStart = null;
    }
    if (isMultiSelecting && multiSelectScreenPos) {
      isMultiSelecting = false;
      const rectWidth = Math.abs(e.clientX - multiSelectScreenPos.sx);
      const rectHeight = Math.abs(e.clientY - multiSelectScreenPos.sy);
      if (rectWidth > 5 || rectHeight > 5) {
        // Drag was large enough to be a selection box - select all in rect
        const linesInRect = renderer.findLinesInRect(
          multiSelectScreenPos.sx, multiSelectScreenPos.sy, e.clientX, e.clientY
        );
        if (e.shiftKey) {
          // Toggle selection for each line in rect
          for (const id of linesInRect) {
            if (store.state.selectedLines.has(id)) store.state.selectedLines.delete(id);
            else store.state.selectedLines.add(id);
          }
        } else {
          // Add all lines in rect to selection
          for (const id of linesInRect) store.state.selectedLines.add(id);
        }
        callbacks.onSelectChange();
      }
      multiSelectScreenPos = null;
    }
    // Phase 6: Commit or cancel pending transform on mouse up
    if (isDraggingLines) {
      isDraggingLines = false;
      if (dragStartScreen) {
        const dx = e.clientX - dragStartScreen.sx;
        const dy = e.clientY - dragStartScreen.sy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= 3 && store.state.pendingTransform) {
          store.commitPendingTransform();
        } else {
          store.cancelPendingTransform();
        }
        dragStartScreen = null;
      }
      store.setDragRectScreen(null);
    }

    if (store.state.resizeState) store.commitResize();
    else if (store.state.rotateState) store.commitRotate();
    invalidate();
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { sx, sy } = screen(e);
    const factor = e.deltaY > 0 ? 0.9 : (e.ctrlKey ? 2 : 1.1);
    store.zoomAtCursor(factor, sx, sy);
    invalidate();
    callbacks.onZoomChanged(store.state.camera.scale);
  };

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Cleanup function
  return (): void => {
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}
