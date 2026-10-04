import type { createIdentitySmokeUi } from "./smoke-book-identity-ui";

/** Observe intermediate DOM states as well as painted frames during adoption. */
export function observeIdentityAdoption() {
  const page = document.querySelector<HTMLElement>(".book-identity-page")!;
  const summary = page.querySelector<HTMLElement>(".identity-summary")!;
  const candidates = [
    ...page.querySelectorAll<HTMLElement>(".identity-candidate")
  ];
  const buttons = [
    ...page.querySelectorAll<HTMLButtonElement>(
      ".identity-candidate button, .identity-record-controls button, .identity-generation .analysis-primary-button"
    )
  ].filter((button) => !button.disabled);
  const images = [
    ...page.querySelectorAll<HTMLImageElement>(".identity-candidate img")
  ];
  const sources = images.map((image) => image.src);
  const rect = (element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    return [
      bounds.left,
      bounds.top + page.scrollTop,
      bounds.width,
      bounds.height
    ];
  };
  const summaryHeight = summary.getBoundingClientRect().height;
  const bounds = buttons.map(rect);
  const opacities = buttons.map((button) =>
    Number(getComputedStyle(button).opacity)
  );
  const unavailable = [
    ...page.querySelectorAll<HTMLButtonElement>(
      ".identity-candidate button:disabled, .identity-record-controls button:disabled, .identity-generation .analysis-primary-button:disabled, .identity-round header button:disabled"
    )
  ];
  const unavailableOpacities = unavailable.map((button) =>
    Number(getComputedStyle(button).opacity)
  );
  const scrollTop = page.scrollTop;
  const result = {
    samples: 0,
    pendingSamples: 0,
    opacityDrop: 0,
    unavailableOpacityChange: 0,
    buttonShift: 0,
    layoutShift: 0,
    scrollShift: 0,
    remounts: 0,
    imageReloads: 0
  };
  function sample() {
    result.samples++;
    if (buttons.some((button) => button.disabled)) result.pendingSamples++;
    result.layoutShift = Math.max(
      result.layoutShift,
      Math.abs(summary.getBoundingClientRect().height - summaryHeight)
    );
    result.scrollShift = Math.max(
      result.scrollShift,
      Math.abs(page.scrollTop - scrollTop)
    );
    result.remounts = Math.max(
      result.remounts,
      candidates.filter((candidate) => !candidate.isConnected).length
    );
    result.imageReloads = Math.max(
      result.imageReloads,
      images.filter(
        (image, index) => !image.isConnected || image.src !== sources[index]
      ).length
    );
    buttons.forEach((button, index) => {
      result.opacityDrop = Math.max(
        result.opacityDrop,
        opacities[index]! - Number(getComputedStyle(button).opacity)
      );
      rect(button).forEach((value, coordinate) => {
        result.buttonShift = Math.max(
          result.buttonShift,
          Math.abs(value! - bounds[index]![coordinate]!)
        );
      });
    });
    unavailable.forEach((button, index) => {
      result.unavailableOpacityChange = Math.max(
        result.unavailableOpacityChange,
        Math.abs(
          unavailableOpacities[index]! -
            Number(getComputedStyle(button).opacity)
        )
      );
    });
  }
  const observer = new MutationObserver(sample);
  observer.observe(page, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true
  });
  let frame = 0;
  function tick() {
    sample();
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => {
    sample();
    observer.disconnect();
    cancelAnimationFrame(frame);
    return result;
  };
}

/** Keep the target visible before sampling; inspect the complete save cycle. */
export async function checkIdentityAdoption(
  makeUi: typeof createIdentitySmokeUi,
  observeAdoption: typeof observeIdentityAdoption,
  action: (button: HTMLButtonElement) => Promise<unknown>,
  selector = ".identity-candidate .identity-adopt"
) {
  const { pause, until } = makeUi();
  const button = await until(() => {
    const target = document.querySelector<HTMLButtonElement>(selector);
    return target && !target.disabled ? target : null;
  }, "adoption target");
  button.scrollIntoView({ block: "center" });
  await pause();
  const finish = observeAdoption();
  let result: ReturnType<typeof finish>;
  try {
    await action(button);
    await until(
      () => button.isConnected && !button.disabled,
      "adoption acknowledgement"
    );
    await pause();
  } finally {
    result = finish();
  }
  if (
    result.layoutShift >= 1 ||
    result.buttonShift >= 1 ||
    result.scrollShift >= 1 ||
    result.opacityDrop >= 0.01 ||
    result.unavailableOpacityChange >= 0.01 ||
    result.remounts ||
    result.imageReloads ||
    !result.pendingSamples
  )
    throw new Error(
      `Book identity smoke: adoption flicker: ${JSON.stringify(result)}`
    );
  return result;
}
