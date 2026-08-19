# Implementation Plan -- Phase 6: Line Transformations & Missing Integration

> Generated: 19.08.2026  
> Status: Planning (Phase 5 verified complete)

## Executive Summary

Phase 5 (UI Polish) has been fully implemented and TypeScript-clean. The store resize, rotate, and pending-transform machinery already exists but is partially wired into the mouse handler. This plan identifies every gap between what exists and the original roadmap items (Steps 21-36).

---

## Current State Assessment

### Fully Working (no changes needed)

All features from phases 1-5 are verified working: drawing, selection, multi-line drag-select box, resize handles, rotation grip, touch pan/pinch-zoom, wheel zoom-to-cursor, undo/redo for lines, zoom/fit/pan controls, opacity slider, context menu, window resize handling, cursor hover feedback, and selection highlights.

### NOT Wired (priority: critical)

#### Issue 1: Multi-line Drag (Pending Transform) Not Triggered by Mouse

Store methods startPendingTransform(), updatePendingTransform(), commitPendingTransform(), cancelPendingTransform() all exist in store.ts and correctly handle per-line canvas offsets. BUT mouse-handler.ts onMouseDown (select mode) calls setActiveLine(nearest) and adds to selectedLines WITHOUT calling startPendingTransform(). User clicks a line selects it but cannot drag it.

Fix: In onMouseDown select mode, after selecting lines, if NOT on a handle AND NOT shift-key, call store.startPendingTransform([selectedIds], canvasX, canvasY) and set isDragging flag. On onMouseMove update via updatePendingTransform(dxScreen, dyScreen, scale). On mouseUp/Escape commit or cancel. Effort: ~30 LOC in mouse-handler.ts.

#### Issue 2: Undo/Redo Does Not Capture Opacity Changes

pushUndo() is called in addLine(), updateLine(), deleteLine(), clearAll(). BUT setCurrentOpacity() does NOT call pushUndo(). Fix: Add one line pushUndo() to setCurrentOpacity(). Effort: 2 lines in store.ts.

#### Issue 3: Resize/Rotate Commit on Mouse Up (ALREADY FIXED)

Mouse-handler calls store.commitResize() and store.commitRotate() on mouseUp (line 175-176). Escape key handler calls cancel methods. No changes needed.

---

## Detailed Implementation Steps

### Step 1: Wire Multi-Line Drag in mouse-handler.ts (~30 min)

Add local variables after line 38:
- `let isDragging = false;`
- `let dragStartScreen: { x: number; y: number } | null = null;`

In onMouseDown select mode (around line 94), after `callbacks.onSelectChange()`, add:
```typescript
const selectedIds = [...store.state.selectedLines];
if (selectedIds.length > 0 && !isMultiSelecting) {
  store.startPendingTransform(selectedIds, canvasPt(sx, sy).x, canvasPt(sx, sy).y);
  isDragging = true;
  dragStartScreen = { x: sx, y: sy };
}
```

In onMouseMove (after line 51), add at the top:
```typescript
if (isDragging && dragStartScreen) {
  const dx = sx - dragStartScreen.x;
  const dy = sy - dragStartScreen.y;
  const c1 = renderer.screenToCanvas(dragStartScreen.x, dragStartScreen.y);
  const c2 = renderer.screenToCanvas(sx, sy);
  store.updatePendingTransform(c2.x - c1.x, c2.y - c1.y, cam.scale);
  invalidate();
  return;
}
```

In onMouseUp (around line 134), add before commitResize/commitRotate:
```typescript
if (isDragging && dragStartScreen) {
  const dx = Math.abs(e.clientX - dragStartScreen.x);
  const dy = Math.abs(e.clientY - dragStartScreen.y);
  if (dx < 3 && dy < 3) {
    store.cancelPendingTransform();
  } else {
    store.commitPendingTransform();
  }
  isDragging = false;
  dragStartScreen = null;
}
```

### Step 2: Make Opacity Changes Undoable in store.ts (2 min)

Add `pushUndo()` to setCurrentOpacity (~line 140):
```typescript
setCurrentOpacity(opacity: number): void {
  pushUndo(); // ADD THIS LINE
  state.currentOpacity = Math.max(0, Math.min(1, opacity));
},
```

### Step 3: Visual Feedback for Multi-Select Box in renderer.ts (20 min)

In renderer render() after drawing handles (~line 124), check for active multi-select rect and draw dashed rectangle overlay. Add `selectionBox: { x1, y1, x2, y2 } | null` field on Renderer that mouse-handler updates during drag.

### Step 4: Ctrl+A Select All in main.ts (5 min)

Add case in keyboard shortcut handler:
```typescript
case 'a': {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const allIds = [...store.state.lines.keys()];
    store.clearSelection();
    for (const id of allIds) store.state.selectedLines.add(id);
    updateSelectionCount();
    markDirty();
  }
  break;
}
```

---

## Files to Modify

| File | Changes Required | Lines Changed |
|------|-----------------|---------------|
| src/input/mouse-handler.ts | Add drag start/update/commit logic | ~30 LOC |
| src/store.ts | Add pushUndo() to setCurrentOpacity | 2 LOC |
| src/rendering/renderer.ts | Draw multi-select box overlay | ~15 LOC |
| src/main.ts | Add Ctrl+A shortcut | 8 LOC |

---

## Acceptance Criteria for Phase 6

1. Lines can be selected AND dragged in Select mode (P0 fix)
2. Opacity changes are undoable via Ctrl+Z (P0 fix)
3. Visual feedback exists during multi-select box drag (P1 improvement)
4. Ctrl+A selects all lines (P1 improvement)
5. TypeScript compiles cleanly (npx tsc --noEmit returns EXIT=0)
6. All existing features (draw, resize, rotate, zoom, undo/redo, touch pan/pinch, context menu) remain functional
