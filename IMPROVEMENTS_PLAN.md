# Improvements Plan — Bug Fixes + Phase 5 (Tools) + Phase 6 (Transformations)

> Generated: 19.08.2026  
> Status: Planning (All three areas scoped for implementation)  
> Non-deletable marker: DONOTDELETE - This document guides full implementation of remaining features and fixes

---

## Executive Summary

This document consolidates all remaining work for the Simple Lines Drawer application into three areas: **(A)** critical bug fixes for zoom and selection, **(B)** Phase 5 tools (drawing preview, line selection with hit testing, multi-line selection), and **(C)** Phase 6 line transformations (drag-to-move, resize, rotate). The existing codebase has partial implementations of many features -- the store's resize/rotate/pending-transform machinery exists but is partially wired into the mouse handler; line drawing works but lacks a dedicated draw tool abstraction; and several integration gaps prevent some features from working end-to-end.

### What Exists Already
- Line creation by click-drag (mouse-handler.ts onMouseDown/onMouseMove/onMouseUp)
- Live preview during line drawing (line.end updates in real-time)
- Mouse wheel zoom toward cursor (mouse-handler.ts onWheel -> store.zoomAtCursor)
- Touch pan and pinch-zoom (touch-handler.ts)
- Hit testing for handles (renderer.findNearestHandleToScreen, renderer.findNearestLineToScreen)
- Multi-line drag-select box via shift+click or click-drag (mouse-handler.ts onMouseDown/select mode)
- Store machinery: startPendingTransform/updatePendingTransform/commitPendingTransform/cancelPendingTransform
- Store machinery: startResize/updateResize/commitResize/cancelResize
- Store machinery: startRotate/updateRotate/commitRotate/cancelRotate
- Undo/redo for lines (pushUndo called in addLine/deleteLine/updateLine)
- Opacity slider (store.currentOpacity, applied during render)
- Color picker and thickness selector buttons
- Context menu with duplicate/delete operations
- Zoom-to-fit, zoom-reset, zoom input

### What Is Missing / Broken
1. **BUG: updateZoomLabel() not called on wheel/touchpad zoom** -- store.camera.scale updates but UI label does not
2. **BUG: Lines may be unselectable after zoom** -- coordinate space conversion in hit testing has edge cases
3. **Phase 5 gap**: No dedicated draw-tool.ts or select-tool.ts -- all logic lives inside mouse-handler.ts
4. **Phase 6 gap**: Multi-line drag not triggered from mouse select mode (lines selected but cannot be dragged)
5. **Phase 6 gap**: Opacity changes are not captured by undo
6. **Phase 6 gap**: No visual feedback for selection box during drag
7. **Phase 6 gap**: Ctrl+A select-all shortcut missing

---

## A. BUG FIXES

### Bug Fix A1: Touchpad Zoom Label Not Updating

**Root Cause:** mouse-handler.ts line 238-244 calls store.zoomAtCursor() and invalidate() but does NOT call updateZoomLabel(). The zoom button handlers in main.ts (lines 145-173) call both. Touchpad gestures work because the camera.scale value updates, but the UI label is stuck at its last value.

**Fix Strategy:** Add an onZoomChanged callback to InputCallbacks that gets invoked after any zoom operation:
1. Add onZoomChanged(scale: number): void to InputCallbacks interface in mouse-handler.ts
2. Pass invalidate + onZoomChanged through to the wheel handler
3. In main.ts, implement onZoomChanged -> call updateZoomLabel()
4. Apply same pattern to touch-handler.ts (already has invalidate but needs zoom notification)

**Affected lines:** mouse-handler.ts line 19 (interface add), line 243-244 (wheel handler change); main.ts callback definition; touch-handler.ts on pinch-zoom paths.

## B. PHASE 5: TOOLS — DRAWING & SELECTION

### Bug Fix A2: Lines Unselectable After Zoom

**Root Cause:** Hit testing in renderer.ts and mouse-handler.ts uses screen-space coordinates converted through different paths. After zoom changes, the conversion between screen-space and canvas-space via camera.scale * offsetX produces different values than expected at non-1x scale factors. The pending transform drag (lines 69-80 of mouse-handler.ts) mixes canvas coords with screen comparison logic.

**Fix Strategy:** Enforce a single coordinate convention:
1. **Screen space (sx, sy):** Mouse event coordinates relative to canvas element. Used for hit testing in renderer methods.
2. **Canvas space (cx, cy):** World-space coordinates. Converted via renderer.screenToCanvas(sx, sy).

Ensure ALL callers of store methods consistently use the correct coordinate space:
- store.startPendingTransform([ids], canvasX, canvasY) -- requires canvas coords
- store.updatePendingTransform(dx, dy, scale) -- dx/dy in screen pixels (movement delta)
- renderer.findNearestLineToScreen(screenX, screenY) -- requires screen coords

**Affected files:** mouse-handler.ts lines 69-80, 168; renderer.ts findNearestLineToScreen.

### B1: Create src/tools/draw-tool.ts

**Purpose:** Extract line-drawing logic from mouse-handler.ts into a reusable tool class that encapsulates draw-mode behavior independently of the input handler.

**Class definition:**
```typescript
interface DrawToolCallbacks {
  onPreviewEnd(canvasX: number, canvasY: number): void;
  onLineFinalized(id: string): void;
  onCancel(): void;
}

class DrawTool {
  constructor(
    private store: LineStore,
    private renderer: Renderer,
    private callbacks: DrawToolCallbacks,
    currentThickness: number,
    currentColor: string,
    currentOpacity: number,
    shadowEnabled: boolean,
    snapToGrid: boolean,
  ) {}

  beginDraw(screenX: number, screenY: number): void;
  continueDraw(screenX: number, screenY: number): void;
  endDraw(screenX: number, screenY: number): string | null; // returns line id or null
  cancel(): void;
  isActive(): boolean;
}
```

**Existing code to extract:** mouse-handler.ts onMouseDown (lines 107-138 for draw mode), onMouseMove lines 83-95, onMouseUp lines 141-192.


**Root Cause:** Hit testing in renderer.ts and mouse-handler.ts uses screen-space coordinates converted through different paths. After zoom changes, the conversion between screen-space and canvas-space via camera.scale * offsetX produces different values than expected at non-1x scale factors. The pending transform drag (lines 69-80 of mouse-handler.ts) mixes canvas coords with screen comparison logic.

**Fix Strategy:** Enforce a single coordinate convention:
1. **Screen space (sx, sy):** Mouse event coordinates relative to canvas element. Used for hit testing in renderer methods.
2. **Canvas space (cx, cy):** World-space coordinates. Converted via renderer.screenToCanvas(sx, sy).

Ensure ALL callers of store methods consistently use the correct coordinate space:
- store.startPendingTransform([ids], canvasX, canvasY) -- requires canvas coords
- store.updatePendingTransform(dx, dy, scale) -- dx/dy in screen pixels (movement delta)
- renderer.findNearestLineToScreen(screenX, screenY) -- requires screen coords

**Affected files:** mouse-handler.ts lines 69-80, 168; renderer.ts findNearestLineToScreen.


### B2: Create src/tools/select-tool.ts

**Purpose:** Encapsulate all select-mode behavior — hit testing, single/multi-line selection, visual feedback.

**Class definition:**
```typescript
interface SelectToolCallbacks {
  onSelectionChange(): void;
  onCursorMove(canvasX: number, canvasY: number): void;
  onHover(lineId: string | null, isOnHandle: boolean): void;
}

class SelectTool {
  constructor(
    private store: LineStore,
    private renderer: Renderer,
    private callbacks: SelectToolCallbacks,
  ) {}

  beginSelect(screenX: number, screenY: number, shiftKey: boolean): void;
  continueSelect(screenX: number, screenY: number, shiftKey: boolean, ctrlKey: boolean): void;
  endSelect(screenX: number, screenY: number, shiftKey: boolean): void;
  cancel(): void;
  getHoverInfo(): { lineId: string | null; isOnHandle: boolean };
}
```

### B3: Multi-line Selection (Shift+Click, Drag-Select Box)

**Already implemented:** mouse-handler.ts lines 107-138 handle shift-click toggling and click-drag selection box via renderer.findLinesInRect().

**Implementation needed in SelectTool:**
- In beginSelect (mousedown): if shiftKey, toggle individual line; if click-drag threshold exceeded, track for potential box
- In continueSelect (mousemove): if drag distance > 5px without starting on handle, start multi-select rect
- In endSelect (mouseup): finalize drag-select via renderer.findLinesInRect() and update store.selectedLines

### B4: Hit Testing Precision Improvements

**File:** renderer.ts findNearestLineToScreen method
**Improvement:** Use MathUtils.distancePointToSegment() from math-utils.ts for exact segment-to-point distance rather than bounding box approach. This gives pixel-perfect hit detection regardless of zoom level.



---

## C. PHASE 6: LINE TRANSFORMATIONS

### C1: Wire Multi-Line Drag in Mouse Handler (Priority: Critical)

**Problem:** Store methods startPendingTransform/updatePendingTransform/commitPendingTransform/cancelPendingTransform exist but are NOT called from mouse-handler.ts onMouseDown select mode. Clicking a line selects it visually but does not prepare for dragging.

**File:** src/input/mouse-handler.ts

**Changes needed in onMouseDown (select mode, around line 120-138):**
After the existing selection logic that adds to store.state.selectedLines:
```typescript
const selectedIds = [...store.state.selectedLines];
if (selectedIds.length > 0 && !isOnHandle) {
  const canvasPos = renderer.screenToCanvas(sx, sy);
  store.startPendingTransform(selectedIds, canvasPos.x, canvasPos.y);
  isDraggingLines = true;
  dragStartScreen = { sx, sy };
}
```

### C2: Visual Feedback for Multi-Select Box (Priority: Medium)

**File:** src/rendering/renderer.ts — Add rendering of the drag-select box in render loop using state.dragRectScreen (dashed rectangle overlay with semi-transparent fill).

### C3: Make Opacity Changes Undoable (Priority: High)

**File:** src/store.ts — setCurrentOpacity() method. Add pushUndo() call at start of method; current implementation does NOT capture opacity state in undo snapshots.

### C4: Ctrl+A Select-All Shortcut (Priority: Medium)

**File:** src/main.ts — keyboard shortcut handler. Add case for Ctrl+A / Meta+A that selects all existing lines.

### C5: Line Resize Handles (Already Partially Wired)

Store exists: startResize/updateResize/commitResize/cancelResize in store.ts lines 268-287. Renderer draws handles. Need to verify mouse-handler.ts onMouseDown calls store.startResize() when on a handle, onMouseMove calls store.updateResize(canvasX, canvasY), and onMouseUp calls store.commitResize().

### C6: Line Rotation (Already Partially Wired)

Store exists: startRotate/updateRotate/commitRotate/cancelRotate in store.ts lines 289-309. Same wiring verification needed as resize — ensure mouse handler calls correct store methods.



---

## D. TEST CHECKLIST COVERAGE

| Test Item | Phase / Area | Implementation Status |
|-----------|-------------|----------------------|
| Create new line by clicking and dragging on canvas | Phase 5 (B1) | Partially works in mouse-handler.ts, needs tool extraction |
| Change line thickness from 5 allowed values — verify immediate effect | UI wiring | Already working via toolbar buttons + store.setCurrentThickness |
| Select existing line — handles appear at endpoints + rotation grip | Phase 5 (B2) | Partially wired; renderer draws handles, hit-testing works |
| Drag selected line(s) to new position — smooth movement, no jitter | Phase 6 (C1) | Store machinery exists, needs mouse-handler wiring |
| Resize line by dragging start/end handle — extends along same axis | Phase 6 (C5) | Store + renderer exist; need mouse-handler verification |
| Rotate line via rotation grip — pivots at midpoint | Phase 6 (C6) | Store + renderer exist; need mouse-handler verification |
| Zoom in/out with mouse wheel — zooms toward cursor | Bug Fix A1 | Works but label does not update — fix needed |
| Zoom in/out with pinch gesture on touch device | Existing | Touch handler works, needs gesture event suppression check |
| Enable/disable shadow — line renders with shadow when enabled | UI wiring | Already working via btn-shadow toggle + store state |
| Pan canvas by middle-mouse or space+drag | touch-handler / mouse-handler | Single-finger pan on touch works; need middle-mouse/keyboard for desktop |
| Delete individual lines | UI / context menu | Already wired via keyboard delete key and context menu |
| Handle up to 1M lines without crashing (FPS may degrade) | Architecture | No explicit test, renderer uses Map iteration — performance review needed |



---

## FILES TO MODIFY (Consolidated List)

### New Files
| File | Purpose |
|------|---------|
| src/tools/draw-tool.ts | Line-drawing abstraction — creates lines with preview |
| src/tools/select-tool.ts | Selection, hit-testing, multi-line selection logic |
| IMPROVEMENTS_PLAN.md | This document |

### Modified Files
| File | Changes Required |
|------|-----------------|
| src/input/mouse-handler.ts | Extract draw/select logic to tool classes; add onZoomChanged callback; wire multi-line drag start from select mode |
| src/rendering/renderer.ts | Add drag-select box rendering; improve hit-testing precision using distancePointToSegment |
| src/store.ts | Add pushUndo() to setCurrentOpacity(); track currentZoomPct in state |
| src/main.ts | Add onZoomChanged callback implementation; add Ctrl+A shortcut; integrate new tool classes |
| src/input/touch-handler.ts | Ensure passive:false gesture event handling for Safari pinch-zoom suppression |
| src/constants.ts | May need additional constants for tool behavior (e.g., click-drag threshold) |

### Type / Interface Changes
- InputCallbacks in mouse-handler.ts: add onZoomChanged(scale: number) callback
- LineStoreState in types.ts: optionally add currentZoomPct: number field
- New DrawToolConfig interface for draw-tool.ts constructor parameters
- New SelectToolConfig interface for select-tool.ts constructor parameters

---

## IMPLEMENTATION ORDER (Prioritized)

### Sprint 1 — Critical Bugs (Priority P0)
1. A1: Fix zoom label update — add onZoomChanged callback mechanism
2. A2: Audit coordinate conversion in hit testing — ensure consistent screen/canvas space usage
3. C3: Make opacity changes undoable — one line change in store.ts

### Sprint 2 — Phase 6 Gaps (Priority P1)
4. C1: Wire multi-line drag from mouse select mode — ~30 lines in mouse-handler.ts
5. C2: Add drag-select box visual feedback — ~15 lines in renderer.ts
6. C4: Add Ctrl+A select-all shortcut — ~8 lines in main.ts

### Sprint 3 — Phase 5 Tool Extraction (Priority P2)
7. B1: Create draw-tool.ts — extract line-drawing logic from mouse-handler
8. B2: Create select-tool.ts — extract selection/hit-testing logic from mouse-handler
9. C5/C6: Verify resize + rotate mouse-handler wiring is complete
10. B4: Improve hit-testing precision in renderer

### Sprint 4 — Polish & Testing (Priority P3)
11. Add touchpad delta normalization for consistent zoom across input devices
12. Performance review: handle 1M+ lines rendering
13. Run through full test checklist
14. TypeScript compilation validation (tsc --noEmit EXIT=0)



---

## ACCEPTANCE CRITERIA

### Bug Fixes
- [ ] Touchpad/mouse wheel zoom updates the zoom label in real-time
- [ ] Lines selected immediately after zoom are still selectable
- [ ] Opacity slider changes are captured by undo (Ctrl+Z reverts opacity)
- [ ] All existing features remain functional after changes

### Phase 5 Tools
- [ ] Line creation via click-drag with live preview works
- [ ] Selection hit-testing accurately detects lines and handles at all zoom levels
- [ ] Multi-line selection via shift+click works (toggle)
- [ ] Drag-select box selects all intersecting lines
- [ ] Tool classes are independent and testable

### Phase 6 Transformations
- [ ] Selected lines can be dragged to new position
- [ ] Resize handles extend line along its axis
- [ ] Rotation grip pivots line at midpoint
- [ ] All transformations support undo via Ctrl+Z
- [ ] Escape key cancels active transformation

### Test Checklist
- [ ] All items in the test checklist table above verified working
- [ ] TypeScript compiles cleanly (tsc --noEmit returns EXIT=0)
- [ ] No console errors or warnings during normal operation

---

## RISK ASSESSMENT

| Risk | Impact | Mitigation |
|------|--------|------------|
| Coordinate space confusion between screen and canvas | Selection breaks after zoom | Use explicit type annotations (ScreenPos vs CanvasPos) in all interfaces |
| Touch gesture events fire alongside wheel events on Mac trackpad | Double-zoom or no-zoom | Suppress default gestures via preventDefault() on touchstart/touchmove |
| Undo snapshot memory grows with line count | Memory leak at large datasets | Store diffs instead of full snapshots; cap undo stack depth |
| Tool class extraction introduces regressions | Existing features break | Write integration tests per feature before extracting; keep mouse-handler as thin adapter |

