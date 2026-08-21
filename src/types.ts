// ============================================================
// Types — LineEntity, CameraState, LineHandles, etc.
// ============================================================

export type Color = string;

// Gradient representation: array of { offset: number, color: string }
export interface GradientStop {
  offset: number;
  color: Color;
}

export type Gradient = GradientStop[];

export interface Point {
  x: number;
  y: number;
}

export interface LineEntity {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  color: Color;
  opacity: number;
  shadowEnabled: boolean;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  shadowColor: Color;
  // Gradient support
  useGradient: boolean;
  gradientStops: Gradient;
  shadowUseGradient: boolean;
  shadowGradientStops: Gradient;
}

export interface LineSnapped {
  id: string;
  startSnapStart: Point;
  endSnapStart: Point;
  startSnapEnd: Point;
  endSnapEnd: Point;
}

export interface LineHandles {
  startHandle: Point;
  endHandle: Point;
  rotationHandle: Point;
  middlePoint: Point;
}

export interface CameraState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

// Dragging / resize state during an interaction
export interface PendingTransform {
  activeLineIds: string[];
  startScreenX: number;
  startScreenY: number;
  lineStartCanvasPositions: Map<string, { start: Point; end: Point }>;
}

export interface ResizeHandleState {
  lineId: string;
  side: 'start' | 'end';
  canvasLineStart: Point;
  canvasLineEnd: Point;
  handleCanvasPos: Point;
}

export interface RotateHandleState {
  lineId: string;
  centerPoint: Point;
  startAngle: number;   // radians from center to cursor at start
  lineStartAngles: Map<string, number>;  // each selected line's original angle
}
