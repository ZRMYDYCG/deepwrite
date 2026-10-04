import { abortImage, SafeImageError } from "./image-http";

export class ImageQueue {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  async acquire(signal: AbortSignal): Promise<() => void> {
    abortImage(signal);
    if (this.active >= 2) {
      await new Promise<void>((resolve, reject) => {
        const resume = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          const index = this.waiting.indexOf(resume);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(new SafeImageError("图片生成已取消。"));
        };
        this.waiting.push(resume);
        signal.addEventListener("abort", abort, { once: true });
      });
    } else {
      this.active += 1;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const resume = this.waiting.shift();
      if (resume) resume();
      else this.active -= 1;
    };
  }
}

export function imageAbortable<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new SafeImageError("图片生成已取消。"));
    signal.addEventListener("abort", abort, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}
