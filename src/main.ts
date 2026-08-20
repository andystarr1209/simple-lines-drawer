// ============================================================
// Simple Lines Drawer - application bootstrap (Phase 3+4 integration)
// ============================================================

import { createLineStore } from '@/store';
import { Renderer } from '@/rendering/renderer';
import { attachMouseHandlers, type InputCallbacks } from '@/input/mouse-handler';
import { attachTouchHandlers } from '@/input/touch-handler';
import { MIN_ZOOM, MAX_ZOOM } from '@/constants';

// DOM elements
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const modeDrawBtn = document.getElementById('mode-draw') as HTMLButtonElement;
const modeSelectBtn = document.getElementById('mode-select') as HTMLButtonElement;
const colorPicker = document.getElementById('color-picker') as HTMLInputElement;
const snapBtn = document.getElementById('btn-snap') as HTMLButtonElement;
const shadowBtn = document.getElementById('btn-shadow') as HTMLButtonElement;
const zoomInBtn = document.getElementById('btn-zoom-in') as HTMLButtonElement;
const zoomOutBtn = document.getElementById('btn-zoom-out') as HTMLButtonElement;
const zoomResetBtn = document.getElementById('btn-zoom-reset') as HTMLButtonElement;
const zoomFitBtn = document.getElementById('btn-zoom-fit') as HTMLButtonElement;
const zoomLabel = document.getElementById('zoom-label') as HTMLSpanElement;
const zoomInput = document.getElementById('zoom-input') as HTMLInputElement;
const opacitySlider = document.getElementById('opacity-slider') as HTMLInputElement;
const opacityLabel = document.getElementById('opacity-label') as HTMLSpanElement;
const selCountBadge = document.getElementById('sel-count') as HTMLSpanElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
const ctxMenu = document.getElementById('context-menu') as HTMLDivElement;
const statusCoords = document.getElementById('status-coords') as HTMLSpanElement;
const statusLineInfo = document.getElementById('status-line') as HTMLSpanElement;

// Initialize store with viewport dimensions
const vpWidth = window.innerWidth;
const vpHeight = window.innerHeight - 37; // toolbar height
const store = createLineStore(vpWidth, vpHeight);

// Initialize renderer
const renderer = new Renderer(canvas, store);

// Set color picker to default color
colorPicker.value = store.state.currentColor;

// --- Render loop (requestAnimationFrame) -----------------------------------

let needsRender = false;

function markDirty(): void {
  if (!needsRender) {
    needsRender = true;
    requestAnimationFrame(tick);
  }
}

function tick(): void {
  needsRender = false;
  renderer.render();
}


// --- Toolbar wiring ---------------------------------------------------------

function setToolMode(mode: string): void {
  store.setToolMode(mode);
  modeDrawBtn.classList.toggle('active', mode === 'draw_line');
  modeSelectBtn.classList.toggle('active', mode === 'select');
}

// Set initial tool mode (draw) so canvas and UI are synced at startup
setToolMode('draw_line');

modeDrawBtn.addEventListener('click', () => setToolMode('draw_line'));
modeSelectBtn.addEventListener('click', () => {
  setToolMode('select');
  store.clearSelection();
});

// Thickness buttons
document.querySelectorAll('[data-thickness]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const t = parseInt(btn.getAttribute('data-thickness')!);
    if (!isNaN(t)) {
      store.setCurrentThickness(t);
      document.querySelectorAll('[data-thickness]').forEach((b) => (b as HTMLButtonElement).classList.remove('active'));
      (btn as HTMLButtonElement).classList.add('active');
    }
  });
});

// Color picker
colorPicker.addEventListener('input', () => {
  store.setCurrentColor(colorPicker.value);
  markDirty();
});

// Snap to grid toggle
snapBtn.addEventListener('click', () => {
  const enabled = !store.state.snapToGrid;
  store.setSnapToGrid(enabled);
  snapBtn.classList.toggle('active', enabled);
});

// Shadow toggle
shadowBtn.addEventListener('click', () => {
  const enabled = !store.state.nextLineShadowEnabled;
  store.setNextLineShadowEnabled(enabled);
  shadowBtn.classList.toggle('active', enabled);
});

// Zoom controls
function updateZoomLabel(): void {
  const pct = Math.round(store.state.camera.scale * 100);
  zoomLabel.textContent = pct + '%';
  zoomInput.value = pct + '%';
}

function updateSelectionCount(): void {
  const count = store.state.selectedLines.size;
  if (count > 0) {
    selCountBadge.textContent = String(count);
    selCountBadge.classList.add('visible');
  } else {
    selCountBadge.textContent = '';
    selCountBadge.classList.remove('visible');
  }
}

function updateStatusInfo(): void {
  const selectedIds = [...store.state.selectedLines];
  if (selectedIds.length > 0) {
    const activeId = store.state.activeLineId || selectedIds[0];
    const line = store.state.lines.get(activeId);
    if (line) {
      const dx = line.end.x - line.start.x;
      const dy = line.end.y - line.start.y;
      const len = Math.sqrt(dx * dx + dy * dy).toFixed(1);
      const angleDeg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      statusLineInfo.style.display = 'inline';
      statusLineInfo.textContent = '|' + len + 'px @' + angleDeg.toFixed(0) + '\u00b0';
    }
  } else {
    statusLineInfo.style.display = 'none';
    statusLineInfo.textContent = '';
  }
}

zoomInBtn.addEventListener('click', () => { store.zoomAtCursor(1.25, vpWidth / 2, vpHeight / 2); markDirty(); updateZoomLabel(); });
zoomOutBtn.addEventListener('click', () => { store.zoomAtCursor(0.8, vpWidth / 2, vpHeight / 2); markDirty(); updateZoomLabel(); });
zoomInput.addEventListener('change', () => {
  let val = zoomInput.value.trim().replace('%', '');
  // Support formats: "150" (percent), "2x" (multiplier), "0.5" (ratio)
  if (val.endsWith('x')) {
    const multiplier = parseFloat(val);
    if (!isNaN(multiplier) && multiplier > 0) {
      const targetScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, multiplier));
      store.setCamera({ scale: targetScale });
      zoomInput.value = Math.round(store.state.camera.scale * 100) + '%';
      updateZoomLabel();
    } else {
      zoomInput.value = Math.round(store.state.camera.scale * 100) + '%';
    }
  } else {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      let targetScale: number;
      if (val.includes('.')) {
        // Decimal value treated as ratio/multiplier: "0.5" → 50%
        targetScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, num));
      } else {
        // Plain integer treated as percent: "150" → 150%
        targetScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, num / 100));
      }
      store.setCamera({ scale: targetScale });
      zoomInput.value = Math.round(store.state.camera.scale * 100) + '%';
      updateZoomLabel();
    } else {
      zoomInput.value = Math.round(store.state.camera.scale * 100) + '%';
    }
  }
  markDirty();
});
zoomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') zoomInput.blur();
});
zoomFitBtn.addEventListener('click', () => { store.zoomToFit(); updateZoomLabel(); });
zoomResetBtn.addEventListener('click', () => {
  store.resetCamera();
  updateZoomLabel();
});

// Opacity slider
opacitySlider.addEventListener('input', () => {
  const val = parseInt(opacitySlider.value) / 100;
  store.setCurrentOpacity(val);
  opacityLabel.textContent = opacitySlider.value + '%';
});

// Clear all button
btnClear.addEventListener('click', () => {
  store.clearAll();
  updateSelectionCount();
  markDirty();
});

// Undo/Redo buttons
btnUndo.addEventListener('click', () => {
  store.undo();
  markDirty();
});
btnRedo.addEventListener('click', () => {
  store.redo();
  markDirty();
});

// Context menu
function showContextMenu(x: number, y: number): void {
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.classList.add('show');
}

function hideContextMenu(): void {
  ctxMenu.classList.remove('show');
}

document.getElementById('ctx-duplicate')!.addEventListener('click', () => {
  const selectedIds = [...store.state.selectedLines];
  if (selectedIds.length > 0) {
    // Duplicate all selected lines
    for (const id of selectedIds) {
      const line = store.getLine(id);
      if (line) {
        const newId = store.addLine(line.start.x + 10, line.start.y + 10, line.end.x + 10, line.end.y + 10);
        // Select the newly created lines
        store.clearSelection();
        store.state.selectedLines.add(newId);
      }
    }
    updateSelectionCount();
    markDirty();
  }
  hideContextMenu();
});

document.getElementById('ctx-delete')!.addEventListener('click', () => {
  const selectedIds = [...store.state.selectedLines];
  if (selectedIds.length > 0) {
    for (const id of selectedIds) store.deleteLine(id);
    store.clearSelection();
    updateSelectionCount();
    markDirty();
  }
  hideContextMenu();
});

document.getElementById('ctx-clear-selected')!.addEventListener('click', () => {
  const selectedIds = [...store.state.selectedLines];
  if (selectedIds.length > 0) {
    for (const id of selectedIds) store.deleteLine(id);
    store.clearSelection();
    updateSelectionCount();
    markDirty();
  }
  hideContextMenu();
});

// Right-click on canvas
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (store.state.selectedLines.size > 0) {
    showContextMenu(e.clientX, e.clientY);
  }
});

document.addEventListener('click', (e) => {
  if (!ctxMenu.contains(e.target as Node)) hideContextMenu();
});


// --- Mouse and Touch input (Phase 4: Steps 15-17) -------------------------

const callbacks: InputCallbacks = {
  onDrawPreview(_canvasX: number, _canvasY: number): void {
    // Live preview handled by mouse handler mutating store.state directly
    markDirty();
  },
  onLineFinalized(id: string): void {
    console.log('Line finalized:', id);
  },
  onSelectChange(): void {
    markDirty();
    updateSelectionCount();
    updateStatusInfo();
  },
  onCursorMove(canvasX: number, canvasY: number): void {
    statusCoords.textContent = 'x: ' + Math.round(canvasX) + ', y: ' + Math.round(canvasY);
  },
  onHover(lineId: string | null, isOnHandle: boolean, handleSide: 'start' | 'end' | 'rotate' | null): void {
    if (store.state.toolMode === 'select') {
      // Show rotation cursor specifically for rotation handle
      if (handleSide === 'rotate') {
        canvas.style.cursor = 'alias'; // rotation cursor
      } else if (isOnHandle) {
        canvas.style.cursor = 'grab';
      } else if (lineId) {
        canvas.style.cursor = 'pointer';
      } else {
        canvas.style.cursor = 'default';
      }
    } else {
      canvas.style.cursor = 'crosshair';
    }
  },
  onZoomChanged(_scale: number): void {
    updateZoomLabel();
  },
};

attachMouseHandlers(canvas, store, renderer, callbacks, markDirty);
attachTouchHandlers(canvas, store, renderer, markDirty, callbacks.onZoomChanged);


// --- Keyboard shortcuts -----------------------------------------------------

document.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case 'd': setToolMode('draw_line'); break;
    case 'v': setToolMode('select'); break;
    case 's': {
      const enabled = !store.state.nextLineShadowEnabled;
      store.setNextLineShadowEnabled(enabled);
      shadowBtn.classList.toggle('active', enabled);
      break;
    }
    case 'delete':
    case 'backspace': {
      if (store.state.selectedLines.size > 0) {
        [...store.state.selectedLines].forEach((id) => store.deleteLine(id));
        store.clearSelection();
      } else if (store.state.activeLineId) {
        store.deleteLine(store.state.activeLineId);
        store.setActiveLine(null);
      }
      markDirty();
      break;
    }
    case 'escape':
      if (store.state.resizeState) store.cancelResize();
      else if (store.state.rotateState) store.cancelRotate();
      else if (store.state.pendingTransform) store.cancelPendingTransform();
      break;
    case 'a':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const allIds = [...store.getAllLines().map(l => l.id)];
        for (const id of allIds) store.state.selectedLines.add(id);
        updateSelectionCount();
        markDirty();
        break;
      }
      break;
    case 'z': {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        store.undo();
        markDirty();
      }
      break;
    }
    case 'y': {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        store.redo();
        markDirty();
      }
      break;
    }
  }
});


// --- Window resize ------------------------------------------------------------

window.addEventListener('resize', () => {
  const newVpW = window.innerWidth;
  const newVpH = window.innerHeight - 37;
  store.updateViewport(newVpW, newVpH);
  updateZoomLabel();
  markDirty();
});

// --- Initial render and start loop -------------------------------------------

updateZoomLabel();
markDirty();

console.log('Simple Lines Drawer - rendering engine active');
