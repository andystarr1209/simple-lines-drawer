// ============================================================
// DrawTool - encapsulates line-drawing behavior
// ============================================================

import type { LineStore } from '@/store';
import type { Renderer } from '@/rendering/renderer';

export interface DrawToolCallbacks {
  onPreviewEnd(canvasX: number, canvasY: number): void;
  onLineFinalized(id: string): void;
  onCancel(): void;
}

export interface DrawToolConfig {
  currentThickness: number;
  currentColor: string;
  currentOpacity: number;
  shadowEnabled: boolean;
  snapToGrid: boolean;
}

export class DrawTool {
  private store: LineStore;
  private renderer: Renderer;
  private callbacks: DrawToolCallbacks;
  private config: DrawToolConfig;
  private isDrawing = false;
  private drawStart: { x: number; y: number } | null = null;
  private activeLineId: string | null = null;

  constructor(
    store: LineStore,
    renderer: Renderer,
    callbacks: DrawToolCallbacks,
    config: DrawToolConfig,
  ) {
    this.store = store;
    this.renderer = renderer;
    this.callbacks = callbacks;
    this.config = config;
  }

  beginDraw(screenX: number, screenY: number): void {
    const canvasPos = this.renderer.screenToCanvas(screenX, screenY);
    this.isDrawing = true;
    this.drawStart = canvasPos;
    this.activeLineId = this.store.addLine(canvasPos.x, canvasPos.y, canvasPos.x, canvasPos.y);
    this.store.setActiveLine(this.activeLineId);
    this.store.setToolMode('select'); // Switch to select mode after start
    this.renderer.markDirty();
  }

  continueDraw(screenX: number, screenY: number): void {
    if (!this.isDrawing || !this.activeLineId) return;
    const canvasPos = this.renderer.screenToCanvas(screenX, screenY);
    const line = this.store.state.lines.get(this.activeLineId);
    if (line) {
      line.end = canvasPos;
    }
    this.callbacks.onPreviewEnd(canvasPos.x, canvasPos.y);
    this.renderer.markDirty();
  }

  endDraw(screenX: number, screenY: number): void {
    if (!this.isDrawing || !this.drawStart || !this.activeLineId) {
      this.isDrawing = false;
      this.drawStart = null;
      this.activeLineId = null;
      return;
    }

    const line = this.store.state.lines.get(this.activeLineId);
    if (line && (Math.abs(line.end.x - line.start.x) > 0.5 || Math.abs(line.end.y - line.start.y) > 0.5)) {
      if (this.config.snapToGrid) {
        const snapped = this.store.snappedEndpoints(
          this.drawStart.x, this.drawStart.y,
          screenX, screenY
        );
        if (snapped) {
          line.start = { x: snapped.startX, y: snapped.startY };
          line.end = { x: snapped.endX, y: snapped.endY };
        }
      }
      this.callbacks.onLineFinalized(this.activeLineId);
    } else {
      this.store.deleteLine(this.activeLineId);
      this.store.setActiveLine(null);
    }

    this.isDrawing = false;
    this.drawStart = null;
    this.activeLineId = null;
    this.renderer.markDirty();
  }

  cancel(): void {
    if (this.isDrawing && this.activeLineId) {
      this.store.deleteLine(this.activeLineId);
      this.store.setActiveLine(null);
    }
    this.isDrawing = false;
    this.drawStart = null;
    this.activeLineId = null;
    this.callbacks.onCancel();
    this.renderer.markDirty();
  }

  isActive(): boolean {
    return this.isDrawing;
  }
}