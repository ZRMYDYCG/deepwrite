interface LoadJob {
  run: () => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** A session-wide bound, including across rapid selection changes. */
export function createLongDocumentLoadQueue() {
  const foreground: LoadJob[] = [];
  const background: LoadJob[] = [];
  let running = 0;
  let runningForeground = 0;
  let scheduled = false;
  let disposed = false;

  function schedule(): void {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      while (!disposed && running < 3) {
        const urgent = foreground.length > 0;
        // Reserve one slot for visible content. Do not issue more speculative
        // reads while a click or an explicit context read is waiting.
        if (!urgent && (runningForeground > 0 || running >= 2)) break;
        const job = (urgent ? foreground : background).shift();
        if (!job) break;
        running += 1;
        if (urgent) runningForeground += 1;
        void Promise.resolve()
          .then(() => (disposed ? undefined : job.run()))
          .then(job.resolve, job.reject)
          .finally(() => {
            running -= 1;
            if (urgent) runningForeground -= 1;
            schedule();
          });
      }
    });
  }

  function enqueue(
    queue: LoadJob[],
    run: () => Promise<void>,
    first = false
  ): Promise<void> {
    if (disposed) return Promise.resolve();
    const result = new Promise<void>((resolve, reject) => {
      const job = { run, resolve, reject };
      if (first) queue.unshift(job);
      else queue.push(job);
    });
    schedule();
    return result;
  }

  function cancelPrefetch(): void {
    for (const job of background.splice(0)) job.resolve();
  }

  return {
    load: (run: () => Promise<void>, first = false): Promise<void> =>
      enqueue(foreground, run, first),
    async prefetch(tasks: Array<() => Promise<void>>): Promise<void> {
      cancelPrefetch();
      await Promise.all(tasks.map((task) => enqueue(background, task)));
    },
    cancelPrefetch,
    dispose(): void {
      disposed = true;
      cancelPrefetch();
      for (const job of foreground.splice(0)) job.resolve();
    }
  };
}
