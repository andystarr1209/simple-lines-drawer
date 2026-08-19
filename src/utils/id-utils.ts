// ============================================================
// Unique ID generator — crypto.randomUUID or fallback counter
// ============================================================

let _counter = 0;

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + counter
  return `id_${Date.now()}_${++_counter}`;
}
