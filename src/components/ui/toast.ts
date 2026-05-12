// Action creator + pub/sub for the global toaster.
//
// Split out of toaster.tsx so the file that owns the renderer
// (toaster.tsx) only exports React components and is eligible for
// Vite/React fast refresh. The actual UI lives in toaster.tsx; this
// file only carries the data plumbing.

export type ToastMessage = {
  id: number;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
};

const listeners = new Set<(t: ToastMessage) => void>();
let nextId = 1;

export function toast(msg: Omit<ToastMessage, 'id'>): void {
  const t = { id: nextId++, ...msg };
  listeners.forEach((l) => l(t));
}

/** Subscribe to toast events. Returns an unsubscribe function. */
export function subscribeToast(
  handler: (t: ToastMessage) => void,
): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}
