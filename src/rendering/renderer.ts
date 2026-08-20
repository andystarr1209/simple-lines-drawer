// ============================================================
// Renderer — canvas setup, DPR-aware drawing, full scene
// ============================================================

import type { LineEntity, Point, CameraState, Viewport } from '@/types';
import type { LineStore } from '@/store';
import { DEFAULT_COLOR, HANDLE_RADIUS, HANDLE_HIT_THRESHOLD, SELECTED_COLOR, HOVER_COLOR } from '@/constants';
import { getVisibleCanvasBounds, getGridConfig } from './camera';
import { distancePointToSegment } from '@/utils/math-utils';

/** Compute canvas-space handle positions for a single line */
function getLineHandles(line: LineEntity): { start: Point; end: Point; center: Point } {
  return {
    start: { ...line.start },
    end: { ...line.end },
    center: { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 },
  };
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private store: LineStore;
  private dpr = window.devicePixelRatio || 1;
  private resizeObserver: ResizeObserver | null = null;

  /** Callback fired on every render for external consumers (e.g. input handler) */
  onRender?: (canvasRect: DOMRectReadOnly) => void;

  constructor(canvasEl: HTMLCanvasElement, store: LineStore) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d')!;
    this.store = store;
    this.setupCanvas();
    this.observeResize();
  }

  private setupCanvas(): void {
    const vp = this.store.state.viewport;
    this.canvas.width = vp.width * this.dpr;
    this.canvas.height = vp.height * this.dpr;
    this.canvas.style.width = `${vp.width}px`;
    this.canvas.style.height = `${vp.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private observeResize(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          this.store.updateViewport(w, h);
          this.setupCanvas();
          this.render();
        }
      }
    });
    this.resizeObserver.observe(this.canvas.parentElement ?? document.body);
  }

  public getCanvasRect(): DOMRectReadOnly {
    return this.canvas.getBoundingClientRect();
  }

  /** Public render trigger — called by the input handler after each state change */
  render(): void {
    const state = this.store.state;
    const ctx = this.ctx;
    const cam = state.camera;
    const vp = state.viewport;

    // Clear
    ctx.clearRect(0, 0, vp.width, vp.height);

    // Layer 1: background fill
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, vp.width, vp.height);

    // Layer 2: grid
    this.drawGrid(ctx, cam, vp);

    // Layer 3: lines (with shadows)
    const allLines = this.store.getAllLines();
    for (const line of allLines) {
      this.drawLine(ctx, line, state.selectedLines.has(line.id));
    }

    // Layer 4: lines with hover highlight (merge into line loop)
    this._hoveredLineId = this._hoverTarget
      ? this.findNearestLineToScreen(this._hoverTarget.x, this._hoverTarget.y)
      : null;
    for (const line of allLines) {
      if (state.selectedLines.has(line.id)) {
        // Selected — draw with selected color
        this.drawLine(ctx, line, true);
      } else if (this._hoveredLineId === line.id) {
        // Hovered (not selected) — draw with hover highlight
        this.drawLine(ctx, { ...line, color: HOVER_COLOR }, true);
      } else {
        // Normal draw
        this.drawLine(ctx, line, false);
      }
    }

    // Layer 5: handles for selected lines (drawn on top)
    // Draw handles for all selected lines
    for (const line of state.lines.values()) {
      if (state.selectedLines.has(line.id)) {
        this.drawHandles(ctx, line, true);
      }
    }
    this.onRender?.(this.canvas.getBoundingClientRect());
  }

  // ============================================================
  // Drawing methods — each renders one layer
  // ============================================================

  private drawGrid(ctx: CanvasRenderingContext2D, camera: CameraState, viewport: Viewport): void {
    const bounds = getVisibleCanvasBounds(camera, viewport);
    const gridConfig = getGridConfig(camera);
    const minorStep = gridConfig.minorStep;
    const majorStep = gridConfig.majorStep;

    if (majorStep * camera.scale < 15) return; // Grid too sparse to draw meaningfully

    // Calculate visible grid lines in canvas space, then convert to screen space
    const startX = Math.floor(bounds.minX / minorStep) * minorStep;
    const endX = Math.ceil(bounds.maxX / minorStep) * minorStep;
    const startY = Math.floor(bounds.minY / minorStep) * minorStep;
    const endY = Math.ceil(bounds.maxY / minorStep) * minorStep;

    // Draw minor grid lines
    ctx.lineWidth = 0.5 / camera.scale;
    for (let x = startX; x <= endX; x += minorStep) {
      const isMajor = Math.abs(x % majorStep) < minorStep * 0.01;
      if (!isMajor) {
        ctx.strokeStyle = gridConfig.minorColor;
        const sx = x * camera.scale + camera.offsetX;
        ctx.beginPath();
        ctx.moveTo(sx, (camera.offsetY) / camera.scale * camera.scale);
        ctx.lineTo(sx, (camera.offsetY + viewport.height) / camera.scale * camera.scale);
        ctx.stroke();
      }
    }

    // Draw major grid lines
    for (let x = startX; x <= endX; x += minorStep) {
      if (Math.abs(x % majorStep) < minorStep * 0.5) {
        const sx = x * camera.scale + camera.offsetX;
        ctx.strokeStyle = gridConfig.majorColor;
        ctx.lineWidth = 0.5 / camera.scale;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, viewport.height);
        ctx.stroke();
      }
    }

    for (let y = startY; y <= endY; y += minorStep) {
      const isMajor = Math.abs(y % majorStep) < minorStep * 0.01;
      if (!isMajor) {
        ctx.strokeStyle = gridConfig.minorColor;
        ctx.lineWidth = 0.5 / camera.scale;
        const sy = y * camera.scale + camera.offsetY;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(viewport.width, sy);
        ctx.stroke();
      }
    }

    for (let y = startY; y <= endY; y += minorStep) {
      if (Math.abs(y % majorStep) < minorStep * 0.5) {
        const sy = y * camera.scale + camera.offsetY;
        ctx.strokeStyle = gridConfig.majorColor;
        ctx.lineWidth = 0.5 / camera.scale;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(viewport.width, sy);
        ctx.stroke();
      }
    }

    // Draw origin crosshair
    const originScreenX = camera.offsetX;
    const originScreenY = camera.offsetY;
    if (originScreenX >= -1 && originScreenX <= viewport.width + 1 &&
        originScreenY >= -1 && originScreenY <= viewport.height + 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1 / camera.scale;
      ctx.beginPath();
      ctx.moveTo(originScreenX, 0);
      ctx.lineTo(originScreenX, viewport.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, originScreenY);
      ctx.lineTo(viewport.width, originScreenY);
      ctx.stroke();
    }
  }


  private drawLine(ctx: CanvasRenderingContext2D, line: LineEntity, isSelected: boolean): void {
    const cam = this.store.state.camera;
    const sx1 = line.start.x * cam.scale + cam.offsetX;
    const sy1 = line.start.y * cam.scale + cam.offsetY;
    const sx2 = line.end.x * cam.scale + cam.offsetX;
    const sy2 = line.end.y * cam.scale + cam.offsetY;

    // Shadow pass (only if enabled on this line)
    if (line.shadowEnabled) {
      ctx.save();
      ctx.shadowColor = line.shadowColor;
      ctx.shadowOffsetX = line.shadowOffsetX;
      ctx.shadowOffsetY = line.shadowOffsetY;
      ctx.shadowBlur = line.shadowBlur * cam.scale;
      ctx.strokeStyle = DEFAULT_COLOR;
      ctx.lineWidth = Math.max(1, line.thickness * cam.scale);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.restore();
    }

    // Main line pass
    const mainColor = isSelected ? SELECTED_COLOR : (line.color || DEFAULT_COLOR);
    ctx.lineWidth = Math.max(1, line.thickness * cam.scale);
    ctx.lineCap = 'round';

    if (isSelected) {
      // Highlight stroke behind
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = Math.max(2, line.thickness * cam.scale) + 2;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Main stroke
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = Math.max(1, line.thickness * cam.scale);
    } else {
      // Apply opacity to the stroke color
      const hexToRgba = (hex: string): string => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${line.opacity})`;
      };
      ctx.strokeStyle = hexToRgba(mainColor);
    }

    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
  }

  private drawHandles(ctx: CanvasRenderingContext2D, line: LineEntity, isSelected: boolean): void {
    const cam = this.store.state.camera;
    const handles = getLineHandles(line);
    const handleRadius = HANDLE_RADIUS / Math.max(1, cam.scale);

    // Start handle
    this.drawHandle(ctx, handles.start.x * cam.scale + cam.offsetX, handles.start.y * cam.scale + cam.offsetY, handleRadius, true, isSelected);
    // End handle
    this.drawHandle(ctx, handles.end.x * cam.scale + cam.offsetX, handles.end.y * cam.scale + cam.offsetY, handleRadius, false, isSelected);

    // Rotation handle (at center, along perpendicular)
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.01) {
      const perpX = (-dy / len) * 30;
      const perpY = (dx / len) * 30;
      const rotScreenX = handles.center.x * cam.scale + cam.offsetX + perpX * cam.scale;
      const rotScreenY = handles.center.y * cam.scale + cam.offsetY + perpY * cam.scale;

      // Dashed line to rotation handle
      ctx.strokeStyle = isSelected ? 'rgba(137, 180, 250, 0.4)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      const dashLen = 4 / cam.scale;
      ctx.setLineDash([dashLen, dashLen]);
      ctx.beginPath();
      ctx.moveTo(handles.center.x * cam.scale + cam.offsetX, handles.center.y * cam.scale + cam.offsetY);
      ctx.lineTo(rotScreenX, rotScreenY);
      ctx.stroke();
      ctx.setLineDash([]);

      this.drawHandle(ctx, rotScreenX, rotScreenY, handleRadius * 0.7, false, isSelected);
    }
  }

  private drawHandle(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, isEndpoint: boolean, isSelected: boolean): void {
    ctx.fillStyle = isSelected ? '#89b4fa' : 'rgba(255,255,255,0.6)';
    const lineWidth = Math.max(1, 1.5 / Math.max(1, this.store.state.camera.scale));
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = '#1e1e2e';
    ctx.beginPath();

    if (isEndpoint) {
      const r = radius * 0.6;
      ctx.moveTo(cx - radius + r, cy - radius);
      ctx.arcTo(cx + radius, cy - radius, cx + radius, cy + radius, r);
      ctx.arcTo(cx + radius, cy + radius, cx - radius, cy + radius, r);
      ctx.arcTo(cx - radius, cy + radius, cx - radius, cy - radius, r);
      ctx.arcTo(cx - radius, cy - radius, cx + radius, cy - radius, r);
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    }

    ctx.fill();
    ctx.stroke();
  }


  // Hover target for next render (set from input handler)
  private _hoverTarget: { x: number; y: number } | null = null;
  private _hoveredLineId: string | null = null;

  public getHoveredLineId(): string | null { return this._hoveredLineId; }

  public getHoverTarget(): { x: number; y: number } | null {
    return this._hoverTarget;
  }

  public setHoverTarget(x: number, y: number): void {
    this._hoverTarget = { x, y };
  }

  public markDirty(): void {
    // Trigger a re-render by calling the render method
    this.render();
  }

  /** Get canvas-space point from screen coordinates */
  public screenToCanvas(screenX: number, screenY: number): Point {
    const cam = this.store.state.camera;
    return {
      x: (screenX - cam.offsetX) / cam.scale,
      y: (screenY - cam.offsetY) / cam.scale,
    };
  }

  public canvasToScreen(canvasX: number, canvasY: number): Point {
    const cam = this.store.state.camera;
    return {
      x: canvasX * cam.scale + cam.offsetX,
      y: canvasY * cam.scale + cam.offsetY,
    };
  }

  /** Find the nearest unselected line to a screen-space point */
  public findNearestLineToScreen(screenX: number, screenY: number): string | null {
    const cam = this.store.state.camera;
    const threshold = HANDLE_HIT_THRESHOLD / cam.scale;
    let nearestId: string | null = null;
    let nearestDist = Infinity;

    for (const line of this.store.getAllLines()) {
      if (this.store.state.selectedLines.has(line.id)) continue;

      // Convert line endpoints to screen space
      const sx1 = line.start.x * cam.scale + cam.offsetX;
      const sy1 = line.start.y * cam.scale + cam.offsetY;
      const sx2 = line.end.x * cam.scale + cam.offsetX;
      const sy2 = line.end.y * cam.scale + cam.offsetY;

      // Use distancePointToSegment for precise hit testing
      const p = { x: screenX, y: screenY };
      const a = { x: sx1, y: sy1 };
      const b = { x: sx2, y: sy2 };

      // Get distance from point to line segment
      const dist = distancePointToSegment(p, a, b);

      if (dist < nearestDist && dist <= threshold) {
        nearestDist = dist;
        nearestId = line.id;
      }
    }

    return nearestId;
  }

  /** Find all line ids that intersect a screen-space bounding box */
  public findLinesInRect(screenX1: number, screenY1: number, screenX2: number, screenY2: number): string[] {
    const cam = this.store.state.camera;
    const xMin = Math.min(screenX1, screenX2);
    const yMin = Math.min(screenY1, screenY2);
    const xMax = Math.max(screenX1, screenX2);
    const yMax = Math.max(screenY1, screenY2);
    const result: string[] = [];

    for (const line of this.store.getAllLines()) {
      // Convert hit rect to screen space
      const sLeft = line.start.x * cam.scale + cam.offsetX;
      const sTop = line.start.y * cam.scale + cam.offsetY;
      const sRight = line.end.x * cam.scale + cam.offsetX;
      const sBottom = line.end.y * cam.scale + cam.offsetY;
      const minX = Math.min(sLeft, sRight) - HANDLE_HIT_THRESHOLD / cam.scale;
      const maxX = Math.max(sLeft, sRight) + HANDLE_HIT_THRESHOLD / cam.scale;
      const minY = Math.min(sTop, sBottom) - HANDLE_HIT_THRESHOLD / cam.scale;
      const maxY = Math.max(sTop, sBottom) + HANDLE_HIT_THRESHOLD / cam.scale;
      // Check intersection with selection rect
      if (minX <= xMax && maxX >= xMin && minY <= yMax && maxY >= yMin) {
        result.push(line.id);
      }
    }
    return result;
  }

  /** Find the nearest handle side for any selected line */
  public findNearestHandleToScreen(
    screenX: number,
    screenY: number,
  ): { lineId: string; side: 'start' | 'end' | 'rotate' } | null {
    const state = this.store.state;
    const cam = state.camera;
    const threshold = HANDLE_HIT_THRESHOLD / cam.scale;

    // Check all selected lines, starting with active line
    const checkedLines = new Set<string>();
    
    // First check active line
    if (state.activeLineId) {
      const line = state.lines.get(state.activeLineId);
      if (line) {
        const result = this.findNearestHandleForLine(line, screenX, screenY, threshold);
        if (result) return result;
      }
    }
    
    // Then check all selected lines
    for (const lineId of state.selectedLines) {
      if (checkedLines.has(lineId)) continue;
      checkedLines.add(lineId);
      const line = state.lines.get(lineId);
      if (line) {
        const result = this.findNearestHandleForLine(line, screenX, screenY, threshold);
        if (result) return result;
      }
    }
    
    return null;
  }

  private findNearestHandleForLine(
    line: LineEntity,
    screenX: number,
    screenY: number,
    threshold: number,
  ): { lineId: string; side: 'start' | 'end' | 'rotate' } | null {
    const cam = this.store.state.camera;
    const handles = getLineHandles(line);

    // Start handle
    const startSX = handles.start.x * cam.scale + cam.offsetX;
    const startSY = handles.start.y * cam.scale + cam.offsetY;
    if (Math.sqrt((screenX - startSX) ** 2 + (screenY - startSY) ** 2) <= threshold * cam.scale) {
      return { lineId: line.id, side: 'start' };
    }

    // End handle
    const endSX = handles.end.x * cam.scale + cam.offsetX;
    const endSY = handles.end.y * cam.scale + cam.offsetY;
    if (Math.sqrt((screenX - endSX) ** 2 + (screenY - endSY) ** 2) <= threshold * cam.scale) {
      return { lineId: line.id, side: 'end' };
    }

    // Rotation handle
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.01) {
      const perpX = (-dy / len) * 30;
      const perpY = (dx / len) * 30;
      const rotSX = handles.center.x * cam.scale + cam.offsetX + perpX * cam.scale;
      const rotSY = handles.center.y * cam.scale + cam.offsetY + perpY * cam.scale;
      if (Math.sqrt((screenX - rotSX) ** 2 + (screenY - rotSY) ** 2) <= threshold * cam.scale * 1.5) {
        return { lineId: line.id, side: 'rotate' };
      }
    }
    return null;
  }

  /** Destroy and clean up */
  public destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }
}

