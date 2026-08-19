// ============================================================
// SelectTool - encapsulates selection and hit-testing behavior
// ============================================================

import type { LineStore } from '@/store';
import type { Renderer } from '@/rendering/renderer';

export interface SelectToolCallbacks {
  onSelectionChange(): void;
  onCursorMove(canvasX: number, canvasY: number): void;
  onHover(lineId: string | null, isOnHandle: boolean): void;
}

export interface SelectToolConfig {
  // For now, no special config needed
}

export class SelectTool {
  private store: LineStore;
  private renderer: Renderer;
  private callbacks: SelectToolCallbacks;
  private isMultiSelecting = false;
  private multiSelectScreenPos: { sx: number; sy: number } | null = null;
  private dragThreshold = 5;

  constructor(
    store: LineStore,
    renderer: Renderer,
    callbacks: SelectToolCallbacks,
    _config: SelectToolConfig = {},
  ) {
    this.store = store;
    this.renderer = renderer;
    this.callbacks = callbacks;
  }

  beginSelect(screenX: number, screenY: number, shiftKey: boolean): void {
    const canvasPos = this.renderer.screenToCanvas(screenX, screenY);

    // Try handle hit first
    const hit = this.renderer.findNearestHandleToScreen(screenX, screenY);
    if (hit) {
      if (hit.side === 'rotate') {
        this.store.startRotate(hit.lineId, screenX, screenY);
      } else {
        this.store.startResize(hit.lineId, hit.side, canvasPos.x, canvasPos.y);
      }
      return;
    }

    // Hit-test lines
    const nearest = this.renderer.findNearestLineToScreen(screenX, screenY);
    if (nearest) {
      this.store.setActiveLine(nearest);
      if (shiftKey) {
        // Toggle selection for this line
        if (this.store.state.selectedLines.has(nearest)) {
          this.store.state.selectedLines.delete(nearest);
        } else {
          this.store.state.selectedLines.add(nearest);
        }
      } else {
        this.store.clearSelection();
        this.store.state.selectedLines.add(nearest);
      }
      this.callbacks.onSelectionChange();

      // Start pending transform for multi-line drag
      if (this.store.state.selectedLines.size >= 1) {
        this.store.startPendingTransform(
          [...this.store.state.selectedLines],
          canvasPos.x,
          canvasPos.y,
        );
      }
      return;
    }

    // Click on empty canvas
    if (shiftKey) {
      // Start multi-select drag
      this.isMultiSelecting = true;
      this.multiSelectScreenPos = { sx: screenX, sy: screenY };
    } else {
      this.store.clearSelection();
      this.store.setActiveLine(null);
      this.callbacks.onSelectionChange();
    }
  }

  continueSelect(screenX: number, screenY: number, shiftKey: boolean): void {
    if (this.isMultiSelecting && this.multiSelectScreenPos) {
      const dx = screenX - this.multiSelectScreenPos.sx;
      const dy = screenY - this.multiSelectScreenPos.sy;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.dragThreshold) {
        this.isMultiSelecting = false;
        // Select all lines in rect
        const linesInRect = this.renderer.findLinesInRect(
          this.multiSelectScreenPos.sx,
          this.multiSelectScreenPos.sy,
          screenX,
          screenY,
        );
        if (shiftKey) {
          // Toggle selection for each line in rect
          for (const id of linesInRect) {
            if (this.store.state.selectedLines.has(id)) {
              this.store.state.selectedLines.delete(id);
            } else {
              this.store.state.selectedLines.add(id);
            }
          }
        } else {
          // Add all lines in rect to selection
          for (const id of linesInRect) {
            this.store.state.selectedLines.add(id);
          }
        }
        this.callbacks.onSelectionChange();
        this.multiSelectScreenPos = null;
      }
      return;
    }

    // Update cursor position for status
    this.callbacks.onCursorMove(this.renderer.screenToCanvas(screenX, screenY).x, this.renderer.screenToCanvas(screenX, screenY).y);
  }

  endSelect(_screenX: number, _screenY: number, _shiftKey: boolean): void {
    // Already handled in continueSelect if multi-selecting
    this.isMultiSelecting = false;
    this.multiSelectScreenPos = null;
  }

  cancel(): void {
    this.isMultiSelecting = false;
    this.multiSelectScreenPos = null;
  }

  getHoverInfo(): { lineId: string | null; isOnHandle: boolean } {
    const hoveredLineId = this.renderer.getHoveredLineId();
    let isOnHandle = false;
    if (hoveredLineId) {
      const hit = this.renderer.findNearestHandleToScreen(this.renderer.screenToCanvas(0, 0).x, this.renderer.screenToCanvas(0, 0).y);
      isOnHandle = hit !== null;
    }
    return { lineId: hoveredLineId, isOnHandle };
  }
}