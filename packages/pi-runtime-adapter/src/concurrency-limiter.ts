/**
 * First-come, first-served gate for async work: at most `capacity` tasks run
 * at once and the rest wait in order. `spawn_subagent` caps its child runs
 * with it; with capacity 1 it queues one run's user-input requests.
 */
export interface ConcurrencyLimiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createConcurrencyLimiter(capacity: number): ConcurrencyLimiter {
  let running = 0;
  const waiting: Array<() => void> = [];
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  };
  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (running < capacity) running += 1;
      // A released slot passes straight to the waiter, so `running` stays.
      else await new Promise<void>((resolve) => waiting.push(resolve));
      try {
        return await task();
      } finally {
        release();
      }
    }
  };
}
