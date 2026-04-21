import localforage from 'localforage';

const store = localforage.createInstance({
  name: 'rabih-ops',
  storeName: 'mutation-queue',
  description: 'Queued RPC mutations while offline',
});

export interface QueuedMutation {
  id: string;
  rpc: string;
  args: Record<string, unknown>;
  queuedAt: string;
}

export async function enqueueMutation(item: Omit<QueuedMutation, 'id' | 'queuedAt'>) {
  const entry: QueuedMutation = {
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
    ...item,
  };
  await store.setItem(entry.id, entry);
  return entry;
}

export async function listQueuedMutations(): Promise<QueuedMutation[]> {
  const items: QueuedMutation[] = [];
  await store.iterate<QueuedMutation, void>((value) => {
    items.push(value);
  });
  return items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function dequeueMutation(id: string) {
  await store.removeItem(id);
}

export async function clearQueue() {
  await store.clear();
}
