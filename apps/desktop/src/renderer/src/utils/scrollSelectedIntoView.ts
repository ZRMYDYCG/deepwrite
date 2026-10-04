export interface ScrollableMenu {
  clientHeight: number;
  contains(node: unknown): boolean;
  getBoundingClientRect(): Pick<DOMRect, "height" | "top">;
  scrollHeight: number;
  scrollTop: number;
}

export function scrollSelectedIntoView(
  scroller: ScrollableMenu | null | undefined,
  selected: Pick<ScrollableMenu, "getBoundingClientRect"> | null | undefined,
  options: { block?: "center" | "nearest" } = {}
): void {
  if (!scroller || !selected || !scroller.contains(selected)) {
    return;
  }
  const selectedRect = selected.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  if (scrollerRect.height <= 0 || scroller.clientHeight <= 0) {
    return;
  }
  const topDelta = selectedRect.top - scrollerRect.top;
  let scrollDelta =
    topDelta - (scroller.clientHeight - selectedRect.height) / 2;
  if (options.block === "nearest") {
    const bottomDelta = topDelta + selectedRect.height - scroller.clientHeight;
    // Keep visible rows still, including a tall row spanning the viewport.
    if (
      (topDelta >= 0 && bottomDelta <= 0) ||
      (topDelta <= 0 && bottomDelta >= 0)
    ) {
      return;
    }
    scrollDelta =
      Math.abs(topDelta) < Math.abs(bottomDelta) ? topDelta : bottomDelta;
  }
  const nextScrollTop = scroller.scrollTop + scrollDelta;
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = Math.max(0, Math.min(nextScrollTop, maxScroll));
}
