# Implementation Plan

## Overview
Fix the bug where every gradient line always renders red-to-blue regardless of the color the user picks. The chosen behavior is a true two-color gradient: a start-color picker and an end-color picker, both visible only in Gradient mode. The root cause is that `state.currentGradient` (the source of all new gradient lines) is initialized to `DEFAULT_GRADIENT` (red-to-blue) and is never updated, `setGradientMode(true)` flips existing lines to gradient without syncing their stop colors, and the single color picker only updates an active line's stops (setting both equal). No renderer changes are needed -- the renderer already renders arbitrary multi-stop gradients correctly.

Scope: store state + mutation methods, the `index.html` toolbar (second picker), and `main.ts` wiring. No new dependencies. Renderer, camera, input, and tools are untouched.

High-level approach:
1. Give the store first-class control of the two-stop `currentGradient` via `setCurrentGradientStart`/`setCurrentGradientEnd`.
2. Fix `setGradientMode` to symmetrically enable/disable gradient on existing lines and to sync their stop colors.
3. Add a second color picker (`#color-picker-end`) shown only in Gradient mode.
4. Route start/end picker input to the active line's gradient stops (when a line is active) or to `state.currentGradient` (when drawing new lines).

## Types
- No changes to `src/types.ts`. `Gradient = GradientStop[]` and `LineEntity.gradientStops` already support N stops.
- `src/store.ts` `LineStoreState`: `currentGradient: Gradient` stays; keep it a two-element array of an offset-0 (start) and offset-1 (end) stop.

## Files

### Modified
1. **src/store.ts**
    - Add `setCurrentGradientStart(color: string)` and `setCurrentGradientEnd(color: string)` to the `LineStore` interface and implementation. They mutate the respective stop color of `state.currentGradient` (offset 0 / offset 1) and call `pushUndo()`.
    - Rewrite `setGradientMode(enabled)`:
      - Set `state.useGradientForNewLines = enabled`.
      - When `enabled`: for every existing line, set `line.useGradient = true` **and** copy `state.currentGradient` (deep copy) into `line.gradientStops` so existing lines reflect the current two-color gradient instead of a stale red-to-blue.
      - When `enabled === false`: for every existing line, set `line.useGradient = false` (fixes the current asymmetric behavior where turning off does nothing).
      - Call `pushUndo()` once.
    - `addLine` already copies `state.currentGradient` into new gradient lines (`store.ts:126`) -- keep it, but change to a deep copy `state.currentGradient.map(s => ({...s}))` so a later picker edit does not retroactively mutate already-drawn lines.

2. **index.html**
    - Add a second color input `#color-picker-end` immediately after `#color-picker` (line ~117). Give it a distinct default (e.g. `#0000ff`), a title `Gradient end color`, and `style="display:none"` so it is hidden in Solid mode. Wrap both pickers in a small flex container so labels/visibility are clean.

3. **src/main.ts**
    - Grab the new element: `const colorPickerEnd = document.getElementById('color-picker-end') as HTMLInputElement;`.
    - Initialize `colorPickerEnd.value` from `store.state.currentGradient` end stop.
    - On the `btn-color-mode` click (`main.ts:95`), also toggle `colorPickerEnd` visibility (`display: isGradientMode ? '' : 'none'`).
    - Replace the single-picker `input` handler (`main.ts:105-133`):
      - Start picker: if `isGradientMode`, when a line is active update that line's `gradientStops[0].color` via a new helper `applyStartColor(color)`; when no line is active call `store.setCurrentGradientStart(color)`; if not in gradient mode call `store.setCurrentColor(color)`.
      - End picker (new `input` handler): if `isGradientMode`, when a line is active update `gradientStops[1].color` via `applyEndColor(color)`; when no line is active call `store.setCurrentGradientEnd(color)`.
    - Add small helpers `applyStartColor(color)` / `applyEndColor(color)` that read the active line's current stops, replace the matching stop's color, and call `store.setLineGradient(activeLineId, newStops)` + `markDirty()`. Reuse the same "ensure 2 stops exist" logic already present.

### Deleted / moved
- None.

## Functions

### New
- `LineStore.setCurrentGradientStart(color: string): void` (`src/store.ts`) -- sets the offset-0 stop color of `state.currentGradient`, then `pushUndo()`.
- `LineStore.setCurrentGradientEnd(color: string): void` (`src/store.ts`) -- sets the offset-1 (last) stop color of `state.currentGradient`, then `pushUndo()`.
- `applyStartColor(color: string)` and `applyEndColor(color: string)` (local in `src/main.ts`) -- update the active line's start/end gradient stop.

### Modified
- `setGradientMode(enabled)` (`src/store.ts`) -- as described in Files.1.
- `addLine` (`src/store.ts:126`) -- deep-copy `state.currentGradient` so each new line owns its stops.
- `btn-color-mode` click handler and `color-picker` input handler (`src/main.ts:95-133`) -- as described in Files.3.

### Removed
- The "set both stops equal" branch in the color picker handler (`main.ts:110-123`) is replaced by the separate start/end handling.

## Classes
- **LineStore** (factory in `src/store.ts`): gains two methods, one method rewritten, one line deep-copied.
- **Renderer** (`src/rendering/renderer.ts`): no change -- `createGradient` already iterates all stops and `drawLine` uses `line.gradientStops` when `line.useGradient`. Verified: two distinct stop colors will render as a real gradient.

## Dependencies
- None. Pure TypeScript/HTML within the existing Vite project.

## Testing
1. **Compile**: `npx tsc --noEmit` returns `EXIT=0`.
2. **Manual** (dev server `npm run dev` in Chrome, optionally via DevTools MCP):
     - Solid mode: pick a color, draw a line -- line is that solid color (regression check).
     - Toggle to Gradient -- the end-color picker appears; existing lines adopt the current two-color gradient (no forced red-to-blue).
     - Pick start color green, end color yellow, draw a line -- line transitions green-to-yellow.
     - Select an existing line and change start/end pickers -- only that line's stops update.
     - Toggle back to Solid -- end picker hides; existing lines render solid in their `color` (verifies the `enabled===false` path).
     - Change start/end in Gradient mode with no active line, then draw -- new line uses the chosen colors (verifies `currentGradient` is maintained).
     - No console errors; undo/redo still work for gradient edits.

### Acceptance Criteria
- [ ] Gradient mode toggle shows/hides the end-color picker and symmetrically toggles gradient on/off for all existing lines.
- [ ] Start picker changes the gradient's start stop; end picker changes the end stop -- independently.
- [ ] New gradient lines reflect the last-picked start/end colors (not hardcoded red-to-blue).
- [ ] Existing solid lines convert to a sensible gradient when toggling Gradient on.
- [ ] Solid mode unchanged; each drawn line owns its own stop array (editing the picker does not retroactively change drawn lines).
- [ ] `npx tsc --noEmit` is clean; no runtime console errors.

## Implementation Order
1. `src/store.ts`: add `setCurrentGradientStart`/`setCurrentGradientEnd` to interface + implementation.
2. `src/store.ts`: rewrite `setGradientMode` (symmetric enable/disable + stop sync).
3. `src/store.ts`: deep-copy `currentGradient` in `addLine`.
4. `index.html`: add `#color-picker-end` (hidden) next to `#color-picker`.
5. `src/main.ts`: grab + init `colorPickerEnd`; toggle its visibility in the mode handler.
6. `src/main.ts`: add `applyStartColor`/`applyEndColor` helpers; wire start picker + new end picker `input` handlers; route no-active-line cases to `setCurrentGradientStart/End`.
7. Run `npx tsc --noEmit`; start `npm run dev`; run the manual test matrix above; fix any gaps.
