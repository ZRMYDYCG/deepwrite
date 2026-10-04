/** DOM waits are serialized into the disposable Electron smoke Renderer. */
export function createIdentitySmokeUi() {
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 40));
  async function until<T>(
    read: () => T | Promise<T>,
    reason: string
  ): Promise<NonNullable<T>> {
    const deadline = Date.now() + 15_000;
    const feedback = new Set<string>();
    while (Date.now() < deadline) {
      document.querySelectorAll(".toast-message__content").forEach((node) => {
        if (node.textContent?.trim()) feedback.add(node.textContent.trim());
      });
      document
        .querySelector<HTMLButtonElement>(".startup-alert-close")
        ?.click();
      const value = await read();
      if (value) return value as NonNullable<T>;
      await pause();
    }
    throw new Error(
      `Book identity UI timeout: ${reason}${feedback.size ? ` (${[...feedback].join("; ")})` : ""}; visible=${document.body.textContent?.replace(/\s+/g, " ").slice(0, 1600)}`
    );
  }
  async function click(selector: string) {
    const node = await until(() => {
      const item = document.querySelector<HTMLButtonElement>(selector);
      return item && !item.disabled ? item : null;
    }, selector);
    node.scrollIntoView({ block: "center" });
    node.click();
  }
  return { pause, until, click };
}
