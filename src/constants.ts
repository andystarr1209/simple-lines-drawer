// ============================================================
// Constants — magic numbers, allowed values, defaults
// ============================================================

export const LINE_THICKNESSES = [1, 2, 3, 5, 8] as const;
export type LineThickness = (typeof LINE_THICKNESSES)[number];

export const HANDLE_RADIUS = 6;          // handle grip radius in screen px
export const HANDLE_HIT_THRESHOLD = 10;  // hit detection threshold for handles
export const ROTATION_HANDLE_OFFSET = 40;// distance from line center to rotation grip

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 20;
export const ZOOM_SPEED = 0.1;           // wheel zoom delta multiplier

export const DEFAULT_THICKNESS: LineThickness = 2;
export const DEFAULT_COLOR = '#000000';
export const SELECTED_COLOR = '#89b4fa';
export const HOVER_COLOR = '#a6e3a1';

export const DEFAULT_SHADOW_ENABLED = false;
export const DEFAULT_SHADOW_OFFSET_X = 3;
export const DEFAULT_SHADOW_OFFSET_Y = 3;
export const DEFAULT_SHADOW_BLUR = 4;
export const DEFAULT_SHADOW_COLOR = 'rgba(0, 0, 0, 0.5)';
export const DEFAULT_OPACITY = 1.0;

// Grid appearance
export const GRID_COLOR = '#181825';
export const GRID_MAJOR_INTERVAL = 100;
export const GRID_MINOR_COUNT = 4;       // subdivisions per major grid

// Interaction modes
export const InteractionMode = {
  None:        'none',
  DrawLine:    'draw_line',
  SelectLine:  'select_line',
  Dragging:    'dragging',
  ResizingStart: 'resizing_start',
  ResizingEnd:   'resizing_end',
  Rotating:      'rotating',
} as const;

export type InteractionModeType = (typeof InteractionMode)[keyof typeof InteractionMode];

// Current tool state (UI-level)
export interface ToolConfig {
  mode: InteractionModeType;
  currentThickness: LineThickness;
  nextLineShadowEnabled: boolean;
}
