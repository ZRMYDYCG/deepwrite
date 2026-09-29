type HorizontalBounds = Pick<DOMRect, "left" | "right" | "bottom">;
type AnchorBounds = Pick<DOMRect, "right" | "bottom">;

export function conversationHistoryPosition(
  anchor: AnchorBounds,
  surface: HorizontalBounds,
  viewport: { width: number; height: number }
): { left: number; top: number; width: number; maxHeight: number } {
  const margin = 8;
  const leftLimit = Math.max(margin, surface.left + margin);
  const rightLimit = Math.min(viewport.width - margin, surface.right - margin);
  const width = Math.max(0, Math.min(370, rightLimit - leftLimit));
  const left = Math.min(
    Math.max(anchor.right - width, leftLimit),
    rightLimit - width
  );
  const top = anchor.bottom + margin;
  const bottomLimit = Math.min(
    viewport.height - margin,
    surface.bottom - margin
  );

  return {
    left,
    top,
    width,
    maxHeight: Math.max(0, Math.min(560, bottomLimit - top))
  };
}
