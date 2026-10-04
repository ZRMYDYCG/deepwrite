/** Escape closes; Tab stays within the dialog's focusable controls. */
export function decompositionDialogKeydown(
  event: KeyboardEvent,
  dialog: HTMLElement | null,
  close: () => void
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;
  const controls = [
    ...dialog.querySelectorAll<HTMLElement>("button, [tabindex='0']")
  ];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
