// LineStore - central state container & mutations
import { generateId } from '@/utils/id-utils';
import type { LineEntity, CameraState, Viewport, PendingTransform, ResizeHandleState, RotateHandleState, Point } from '@/types';
import { DEFAULT_THICKNESS, DEFAULT_COLOR, DEFAULT_SHADOW_ENABLED, DEFAULT_SHADOW_OFFSET_X, DEFAULT_SHADOW_OFFSET_Y, DEFAULT_SHADOW_BLUR, DEFAULT_SHADOW_COLOR, DEFAULT_OPACITY, MIN_ZOOM, MAX_ZOOM } from '@/constants';
import { getGridCellSize } from '@/rendering/camera';

export interface LineStoreState {
  lines: Map<string, LineEntity>;
  camera: CameraState;
  viewport: Viewport;
  toolMode: string;
  currentThickness: number;
  currentOpacity: number;
  nextLineShadowEnabled: boolean;
  activeLineId: string | null;
  selectedLines: Set<string>;
  pendingTransform: PendingTransform | null;
  resizeState: ResizeHandleState | null;
  rotateState: RotateHandleState | null;
  dragRectScreen: { x1: number; y1: number; x2: number; y2: number } | null;
  currentColor: string;
  snapToGrid: boolean;
}

export interface LineStore {
  readonly state: Readonly<LineStoreState>;
  addLine(startX: number, startY: number, endX: number, endY: number): string;
  updateLine(id: string, updates: Partial<Omit<LineEntity, 'id'>>): void;
  deleteLine(id: string): void;
  getLine(id: string): LineEntity | undefined;
  getAllLines(): ReadonlyArray<LineEntity>;
  clearAll(): void;
  updateViewport(width: number, height: number): void;
  setCamera(updates: Partial<Pick<CameraState, 'scale' | 'offsetX' | 'offsetY'>>): void;
  resetCamera(): void;
  zoomAtCursor(delta: number, screenX: number, screenY: number): void;
  setToolMode(mode: string): void;
  setCurrentThickness(thickness: number): void;
  setCurrentOpacity(opacity: number): void;
  getCurrentOpacity(): number;
  setNextLineShadowEnabled(enabled: boolean): void;
  zoomToFit(): void;
  setActiveLine(id: string | null): void;
  clearSelection(): void;
  startPendingTransform(lineIds: string[], mouseCanvasX: number, mouseCanvasY: number): void;
  updatePendingTransform(dxScreen: number, dyScreen: number, scale: number): void;
  commitPendingTransform(): void;
  cancelPendingTransform(): void;
  setDragRectScreen(rect: { x1: number; y1: number; x2: number; y2: number } | null): void;
  startResize(lineId: string, side: 'start' | 'end', mouseCanvasX: number, mouseCanvasY: number): void;
  updateResize(mouseCanvasX: number, mouseCanvasY: number): void;
  commitResize(): void;
  cancelResize(): void;
  startRotate(lineId: string, mouseCanvasX: number, mouseCanvasY: number): void;
  updateRotate(mouseCanvasX: number, mouseCanvasY: number): void;
  commitRotate(): void;
  cancelRotate(): void;
  undo(): void;
  redo(): void;
  snapPoint(canvasX: number, canvasY: number): Point;
  setCurrentColor(color: string): void;
  setSnapToGrid(enabled: boolean): void;
  getSnappedEndPoint(): Point | null;
  snappedEndpoints(screenX1: number, screenY1: number, screenX2: number, screenY2: number): { startX: number; startY: number; endX: number; endY: number } | null;
}

interface UndoSnapshot { lines: Map<string, LineEntity>; currentOpacity: number; currentColor: string; }
function createDefaultCamera(): CameraState {
  return { scale: 1, offsetX: 0, offsetY: 0 };
}

export function createLineStore(viewportWidth: number, viewportHeight: number): LineStore {
  const state: LineStoreState = {
    lines: new Map(),
    camera: createDefaultCamera(),
    viewport: { width: viewportWidth, height: viewportHeight },
    toolMode: 'none',
    currentThickness: DEFAULT_THICKNESS,
    currentOpacity: DEFAULT_OPACITY,
    nextLineShadowEnabled: DEFAULT_SHADOW_ENABLED,
    activeLineId: null,
    selectedLines: new Set(),
    pendingTransform: null,
    resizeState: null,
    rotateState: null,
    dragRectScreen: null,
    currentColor: DEFAULT_COLOR,
    snapToGrid: false,
  };
  let undoStack: UndoSnapshot[] = [];
  let redoStack: UndoSnapshot[] = [];
  function pushUndo(): void {
    undoStack.push({ lines: new Map(state.lines), currentOpacity: state.currentOpacity, currentColor: state.currentColor });
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  const s = () => state.camera.scale;
  const ox = () => state.camera.offsetX;
  const oy = () => state.camera.offsetY;
  const store: LineStore = {
    get state() { return state as Readonly<LineStoreState>; },
    addLine(startX: number, startY: number, endX: number, endY: number): string {
      pushUndo();
      const id = generateId();
      state.lines.set(id, {
        id, start: { x: startX, y: startY }, end: { x: endX, y: endY },
        thickness: state.currentThickness, color: state.currentColor,
        shadowEnabled: state.nextLineShadowEnabled,
        shadowOffsetX: DEFAULT_SHADOW_OFFSET_X, shadowOffsetY: DEFAULT_SHADOW_OFFSET_Y,
        shadowBlur: DEFAULT_SHADOW_BLUR, shadowColor: DEFAULT_SHADOW_COLOR,
        opacity: state.currentOpacity,
      });
      return id;
    },
    updateLine(id: string, updates: Partial<Omit<LineEntity, 'id'>>): void {
      pushUndo();
      const line = state.lines.get(id);
      if (line) Object.assign(line, updates);
    },
    deleteLine(id: string): void {
      pushUndo();
      state.lines.delete(id);
      state.selectedLines.delete(id);
      if (state.activeLineId === id) state.activeLineId = null;
    },
    getLine(id: string): LineEntity | undefined { return state.lines.get(id); },
    getAllLines(): ReadonlyArray<LineEntity> { return Array.from(state.lines.values()); },
    clearAll(): void {
      pushUndo();
      state.lines.clear(); state.selectedLines.clear(); state.activeLineId = null;
    },
    setCamera(updates: Partial<Pick<CameraState, 'scale' | 'offsetX' | 'offsetY'>>): void {
      state.camera = { ...state.camera, ...updates };
    },
    resetCamera(): void {
      const cx = state.viewport.width / 2;
      const cy = state.viewport.height / 2;
      state.camera = { scale: 1, offsetX: -cx, offsetY: -cy };
    },
    zoomAtCursor(delta: number, screenX: number, screenY: number): void {
      const oldScale = s();
      const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldScale * delta));
      const factor = newScale / oldScale;
      state.camera.scale = newScale;
      state.camera.offsetX = screenX - (screenX - ox()) * factor;
      state.camera.offsetY = screenY - (screenY - oy()) * factor;
    },
    setToolMode(mode: string): void { state.toolMode = mode; },
    setCurrentThickness(t: number): void { state.currentThickness = t; },
    setNextLineShadowEnabled(en: boolean): void { state.nextLineShadowEnabled = en; },

    setCurrentOpacity(opacity: number): void { state.currentOpacity = Math.max(0, Math.min(1, opacity)); pushUndo(); },

    getCurrentOpacity(): number { return state.currentOpacity; },

    zoomToFit(): void {
      const lines = [...state.lines.values()];
      if (lines.length === 0) {
        state.camera = { scale: 1, offsetX: 0, offsetY: 0 };
        return;
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const line of lines) {
        minX = Math.min(minX, line.start.x, line.end.x);
        minY = Math.min(minY, line.start.y, line.end.y);
        maxX = Math.max(maxX, line.start.x, line.end.x);
        maxY = Math.max(maxY, line.start.y, line.end.y);
      }
      const pad = 80;
      const bw = maxX - minX || 1, bh = maxY - minY || 1;
      const vw = state.viewport.width / state.camera.scale, vh = state.viewport.height / state.camera.scale;
      const fitScale = Math.min(vw / (bw + pad * 2), vh / (bh + pad * 2));
      const cs = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitScale));
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      state.camera.scale = cs;
      state.camera.offsetX = state.viewport.width / 2 - cx * cs;
      state.camera.offsetY = state.viewport.height / 2 - cy * cs;
    },
    setActiveLine(id: string | null): void {
      state.activeLineId = id;
      if (id) { state.selectedLines.clear(); state.selectedLines.add(id); }
      else { state.selectedLines.clear(); }
    },
    clearSelection(): void {
      state.activeLineId = null; state.selectedLines.clear();
    },


    startPendingTransform(lineIds: string[], mouseCanvasX: number, mouseCanvasY: number): void {
      const positions = new Map<string, { start:{x:number;y:number}; end:{x:number;y:number} }>();
      for (const id of lineIds) {
        const line = state.lines.get(id);
        if (line) positions.set(id, { start:{...line.start}, end:{...line.end} });
      }
      const mx = mouseCanvasX * s() + ox();
      const my = mouseCanvasY * s() + oy();
      state.pendingTransform = { activeLineIds:[...lineIds], startScreenX:mx, startScreenY:my,
        lineStartCanvasPositions: positions as Map<string,{start:{x:number;y:number};end:{x:number;y:number}}>, };
    },
    updatePendingTransform(dxScreen: number, dyScreen: number, scale: number): void {
      if (!state.pendingTransform) return;
      const dx = dxScreen / scale, dy = dyScreen / scale;
      for (const id of state.pendingTransform.activeLineIds) {
        const line = state.lines.get(id);
        const op = state.pendingTransform?.lineStartCanvasPositions.get(id);
        if (line && op) { line.start={x:op.start.x+dx,y:op.start.y+dy}; line.end={x:op.end.x+dx,y:op.end.y+dy}; }
      }
    },
    commitPendingTransform(): void { state.pendingTransform = null; },
    cancelPendingTransform(): void {
      if (state.pendingTransform) {
        for (const id of state.pendingTransform.activeLineIds) {
          const line = state.lines.get(id);
          const op = state.pendingTransform.lineStartCanvasPositions.get(id);
          if (line && op) { line.start={...op.start}; line.end={...op.end}; }
        }
      }
      state.pendingTransform = null;
    },

    setDragRectScreen(rect: { x1: number; y1: number; x2: number; y2: number } | null): void {
      state.dragRectScreen = rect;
    },

    snapPoint(canvasX: number, canvasY: number): Point {
      if (!state.snapToGrid) return { x: canvasX, y: canvasY };
      const cellSize = getGridCellSize(state.camera);
      const snappedX = Math.round(canvasX / cellSize) * cellSize;
      const snappedY = Math.round(canvasY / cellSize) * cellSize;
      return { x: snappedX, y: snappedY };
    },

    setCurrentColor(color: string): void {
      state.currentColor = color; pushUndo();
    },

    setSnapToGrid(enabled: boolean): void {
      state.snapToGrid = enabled;
    },

    getSnappedEndPoint(): Point | null {
      if (!state.snapToGrid || !state.activeLineId) return null;
      const line = state.lines.get(state.activeLineId);
      if (!line) return null;
      const cellSize = getGridCellSize(state.camera);
      const snappedEndX = Math.round(line.end.x / cellSize) * cellSize;
      const snappedEndY = Math.round(line.end.y / cellSize) * cellSize;
      return { x: snappedEndX, y: snappedEndY };
    },

    snappedEndpoints(screenX1: number, screenY1: number, screenX2: number, screenY2: number): { startX: number; startY: number; endX: number; endY: number } | null {
      if (!state.snapToGrid) return null;
      const invScale = 1 / state.camera.scale;
      const c1x = (screenX1 - state.camera.offsetX) * invScale;
      const c1y = (screenY1 - state.camera.offsetY) * invScale;
      const c2x = (screenX2 - state.camera.offsetX) * invScale;
      const c2y = (screenY2 - state.camera.offsetY) * invScale;
      const cellSize = getGridCellSize(state.camera);
      return {
        startX: Math.round(c1x / cellSize) * cellSize,
        startY: Math.round(c1y / cellSize) * cellSize,
        endX: Math.round(c2x / cellSize) * cellSize,
        endY: Math.round(c2y / cellSize) * cellSize,
      };
    },


    startResize(lineId: string, side: 'start' | 'end', _mouseCanvasX: number, _mouseCanvasY: number): void {
      const line = state.lines.get(lineId); if (!line) return;
      const hp = side === 'start' ? {...line.start} : {...line.end};
      state.resizeState = { lineId, side, canvasLineStart:{...line.start}, canvasLineEnd:{...line.end}, handleCanvasPos:hp };
    },
    updateResize(mouseCanvasX: number, mouseCanvasY: number): void {
      if (!state.resizeState) return;
      const line = state.lines.get(state.resizeState.lineId); if (!line) return;
      const pt = { x: mouseCanvasX, y: mouseCanvasY };
      if (state.resizeState.side === 'start') line.start = pt; else line.end = pt;
      state.resizeState.handleCanvasPos = pt;
    },
    commitResize(): void { state.resizeState = null; },
    cancelResize(): void {
      if (state.resizeState) {
        const line = state.lines.get(state.resizeState.lineId);
        if (line) { line.start={...state.resizeState.canvasLineStart}; line.end={...state.resizeState.canvasLineEnd}; }
      }
      state.resizeState = null;
    },

    startRotate(lineId: string, mouseCanvasX: number, mouseCanvasY: number): void {
      const line = state.lines.get(lineId); if (!line) return;
      const cx=(line.start.x+line.end.x)/2, cy=(line.start.y+line.end.y)/2;
      const sa = Math.atan2(mouseCanvasY-cy, mouseCanvasX-cx);
      state.rotateState = { lineId, centerPoint:{x:cx,y:cy}, startAngle:sa,
        lineStartAngles: new Map([[lineId, Math.atan2(line.end.y-line.start.y, line.end.x-line.start.x)]]), };
    },
    updateRotate(mouseCanvasX: number, mouseCanvasY: number): void {
      if (!state.rotateState) return;
      const line = state.lines.get(state.rotateState.lineId); if (!line) return;
      const rs = state.rotateState;
      const ca = Math.atan2(mouseCanvasY-rs.centerPoint.y, mouseCanvasX-rs.centerPoint.x);
      const da = ca - rs.startAngle;
      // Apply damping factor to slow down rotation
      const DAMPING = 0.1;
      const dampedDa = da * DAMPING;
      const co = Math.cos(dampedDa), si = Math.sin(dampedDa);
      const dsx=line.start.x-rs.centerPoint.x, dsy=line.start.y-rs.centerPoint.y;
      const dex=line.end.x-rs.centerPoint.x, dey=line.end.y-rs.centerPoint.y;
      line.start={x:rs.centerPoint.x+(dsx*co-dsy*si), y:rs.centerPoint.y+(dsx*si+dsy*co)};
      line.end={x:rs.centerPoint.x+(dex*co-dey*si), y:rs.centerPoint.y+(dex*si+dey*co)};
    },
    commitRotate(): void { state.rotateState = null; },
    cancelRotate(): void { state.rotateState = null; },

    updateViewport(width: number, height: number): void {
      if (state.viewport.width !== width || state.viewport.height !== height) {
        state.viewport = { width, height };
      }
    },

    undo(): void {
      if (!undoStack.length) return;
      redoStack.push({ lines: new Map(state.lines), currentOpacity: state.currentOpacity, currentColor: state.currentColor });
      const p = undoStack.pop()!;
      state.lines.clear(); p.lines.forEach((v,k)=>state.lines.set(k,v));
      state.currentOpacity = p.currentOpacity;
      state.currentColor = p.currentColor;
    },
    redo(): void {
      if (!redoStack.length) return;
      undoStack.push({ lines: new Map(state.lines), currentOpacity: state.currentOpacity, currentColor: state.currentColor });
      const n = redoStack.pop()!;
      state.lines.clear(); n.lines.forEach((v,k)=>state.lines.set(k,v));
      state.currentOpacity = n.currentOpacity;
      state.currentColor = n.currentColor;

    },
  };

  return store;
}

