import type { DecompositionTargetUpdatedEvent } from "@deepwrite/contracts/renderer";

/** Coalesces durable write notifications so chapter checkpoints do not flood IPC. */
export function createDecompositionTargetRefresh(ports: {
  long(bookId: string): Promise<unknown>;
  materials(): Promise<unknown>;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let working = false;
  let disposed = false;
  const books = new Set<string>();
  let materials = false;
  let waiters: Array<{ resolve(): void; reject(error: unknown): void }> = [];
  function schedule() {
    if (!timer && !working && !disposed)
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, 150);
  }
  async function flush() {
    working = true;
    const current = waiters;
    waiters = [];
    const ids = [...books];
    books.clear();
    const refreshMaterials = materials;
    materials = false;
    try {
      await Promise.all([
        ...ids.map((id) => ports.long(id)),
        ...(refreshMaterials ? [ports.materials()] : [])
      ]);
      current.forEach(({ resolve }) => resolve());
    } catch (error) {
      current.forEach(({ reject }) => reject(error));
    } finally {
      working = false;
      if (waiters.length) schedule();
    }
  }
  return {
    handle(event: DecompositionTargetUpdatedEvent): Promise<void> {
      if (disposed) return Promise.resolve();
      if (event.payload.targetKind === "long")
        event.payload.projectIds.forEach((id) => books.add(id));
      else materials = true;
      const result = new Promise<void>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
      schedule();
      return result;
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      waiters.forEach(({ resolve }) => resolve());
      waiters = [];
      books.clear();
    }
  };
}
