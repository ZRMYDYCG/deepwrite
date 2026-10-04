import type {
  ChatAssistantProjectRef,
  DeepWriteApi,
  SystemEventEnvelope
} from "@deepwrite/contracts";
import type { createIdentitySmokeUi } from "./smoke-book-identity-ui";
import type {
  checkIdentityAdoption,
  observeIdentityAdoption
} from "./smoke-book-identity-adoption";

/** Executes the real Preload, Main, Agent and Core, using isolated Faux services. */
export async function identitySmokeInRenderer(
  makeUi: typeof createIdentitySmokeUi,
  observeAdoption: typeof observeIdentityAdoption,
  checkAdoptionInUi: typeof checkIdentityAdoption,
  book: ChatAssistantProjectRef
) {
  const api = (globalThis as unknown as { deepwrite: DeepWriteApi }).deepwrite;
  const ensure = (condition: unknown, reason: string) => {
    if (!condition) throw new Error(`Book identity smoke: ${reason}`);
  };
  const { pause, until, click } = makeUi();
  document
    .querySelector<HTMLButtonElement>(
      ".startup-alert-dialog .startup-alert-close"
    )
    ?.click();
  if (!document.querySelector('[data-feature-id="book-identity"]'))
    await click('[data-nav-id="more"]');
  await click('[data-feature-id="book-identity"]');
  await until(
    () => document.querySelector(".book-identity-page .identity-picker"),
    "page and selected book"
  );
  await until(
    () =>
      document
        .querySelector(".identity-header-actions .analysis-model-trigger")
        ?.getAttribute("title")
        ?.includes("身份设计 Faux"),
    "persisted smoke model selected"
  );
  let updatedEvents = 0;
  const unsubscribeUpdates = api.events.subscribe((event) => {
    if (
      event.type === "book_identity.updated" &&
      event.payload.bookKey === `short:${book.projectId}`
    )
      updatedEvents += 1;
  });
  async function run(
    agentId: "book-title-design" | "book-synopsis-design" | "book-cover-design"
  ) {
    const events: SystemEventEnvelope[] = [];
    const toasts = new Set<string>();
    const observeToasts = setInterval(() => {
      for (const toast of document.querySelectorAll(".ui-toast"))
        if (toast.textContent?.trim()) toasts.add(toast.textContent.trim());
    }, 40);
    let finish!: () => void;
    const terminal = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const unsubscribe = api.events.subscribe((event) => {
      events.push(event);
      if (event.type === "agent.error") finish();
      if (
        event.type === "agent.message_completed" &&
        events.some(
          (event) =>
            event.type === "extras_agent.output_updated" &&
            event.payload.agentId === agentId
        )
      )
        finish();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const tabIndex =
        agentId === "book-title-design"
          ? 0
          : agentId === "book-synopsis-design"
            ? 1
            : 2;
      const tab = await until(
        () =>
          document.querySelectorAll<HTMLButtonElement>(".identity-tabs button")[
            tabIndex
          ],
        "selected book tabs"
      );
      tab.click();
      await click(".identity-settings-trigger");
      await until(() => {
        const input = document.querySelector<HTMLInputElement>(
          '.identity-generation-settings input[type="number"]'
        );
        return input && !input.disabled ? input : null;
      }, "profile and selected model");
      await pause();
      if (agentId === "book-cover-design") {
        const ratioSelector =
          ".identity-generation-settings .identity-generation-grid:nth-child(2) .popup-select-trigger";
        const ratio = document.querySelector<HTMLButtonElement>(ratioSelector)!;
        ensure(ratio.textContent?.trim() === "3:4", "cover default is not 3:4");
        for (const value of ["9:16", "3:4"]) {
          await click(ratioSelector);
          const menu = await until(() => {
            const id = ratio.getAttribute("aria-controls");
            return id ? document.getElementById(id) : null;
          }, "cover ratio menu");
          const options = [
            ...menu.querySelectorAll<HTMLButtonElement>("[role=option]")
          ];
          ensure(
            ["3:4", "2:3", "9:16", "1:1", "16:9"].every((label) =>
              options.some((option) => option.textContent?.trim() === label)
            ),
            "common cover ratios missing"
          );
          const option = options.find(
            (option) => option.textContent?.trim() === value
          )!;
          option.scrollIntoView({ block: "nearest" });
          await until(() => {
            const rect = option.getBoundingClientRect();
            const hit = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2
            );
            return hit && option.contains(hit);
          }, "cover ratio menu above the dialog");
          option.click();
          await until(
            () => ratio.textContent?.trim() === value,
            `cover ratio selected ${value}`
          );
          await until(
            () => !document.getElementById(menu.id),
            "ratio menu closed"
          );
        }
      }
      const input = document.querySelector<HTMLInputElement>(
        '.identity-generation-settings input[type="number"]'
      )!;
      input.value = "2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await click(".identity-settings-dialog footer .analysis-primary-button");
      ensure(
        !document.querySelector(".identity-generation input"),
        "configuration still occupies the run area"
      );
      await click(".identity-generation .analysis-primary-button");
      await Promise.race([
        terminal,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${agentId} timed out`)),
            15_000
          );
        })
      ]);
      const failure = events.find((event) => event.type === "agent.error");
      ensure(
        !failure,
        failure && "message" in failure.payload
          ? String(failure.payload.message)
          : "agent error"
      );
      const output = events.find(
        (event) => event.type === "extras_agent.output_updated"
      );
      ensure(
        output?.type === "extras_agent.output_updated" &&
          output.payload.output.kind === "book-identity-round",
        "round output missing"
      );
      ensure(
        events.some((event) => event.type === "tool.call_requested"),
        "read and submit tools did not run"
      );
      return api.bookIdentity.get({ book });
    } catch (error) {
      const record = await api.bookIdentity.get({ book });
      const state = {
        toasts: [...toasts],
        model: document
          .querySelector(".identity-header-actions .analysis-model-trigger")
          ?.getAttribute("title"),
        rounds: record.rounds.map((round) => ({
          id: round.id,
          field: round.field,
          count: round.candidates.length
        })),
        events: events.slice(-24).map((event) => ({
          type: event.type,
          ...([
            "agent.error",
            "tool.execution_completed",
            "agent.turn_started",
            "agent.retry_scheduled"
          ].includes(event.type)
            ? { payload: event.payload }
            : {})
        })),
        visible: document
          .querySelector(".book-identity-page")
          ?.textContent?.replace(/\s+/g, " ")
          .trim()
      };
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; state=${JSON.stringify(state)}`,
        { cause: error }
      );
    } finally {
      clearInterval(observeToasts);
      if (timer) clearTimeout(timer);
      unsubscribe();
    }
  }
  const adoptionChecks: ReturnType<
    ReturnType<typeof observeIdentityAdoption>
  >[] = [];
  async function checkAdoption(action: () => Promise<void>) {
    adoptionChecks.push(
      await checkAdoptionInUi(makeUi, observeAdoption, action)
    );
  }
  async function loadImage(file: string, revision: number) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`cover protocol failed: ${file}`));
      image.src = `deepwrite-cover://asset/short/${book.projectId}/${file}?revision=${revision}`;
    });
    return image;
  }
  try {
    let record = await run("book-title-design");
    const titleRound = record.rounds.find((round) => round.field === "title")!;
    ensure(
      titleRound.field === "title" && titleRound.candidates.length === 2,
      "wrong title candidate count"
    );
    const title = titleRound.candidates[0]!;
    await checkAdoption(async () => {
      await click(".identity-candidate .identity-adopt");
      record = await until(async () => {
        const value = await api.bookIdentity.get({ book });
        return value.adopted.title?.candidateId === title.id ? value : null;
      }, "title adoption");
    });
    ensure(record.adopted.title, "title adoption missing");
    const rename = await until(
      () =>
        [
          ...document.querySelectorAll<HTMLButtonElement>(
            ".identity-summary button"
          )
        ].find((button) => button.textContent?.trim() === "改为此名"),
      "rename action"
    );
    rename.click();
    await until(
      async () =>
        (await api.catalog.index()).books.some(
          (entry) =>
            entry.id === book.projectId &&
            entry.title === record.adopted.title!.title
        ),
      "adopted title renamed book"
    );
    record = await run("book-synopsis-design");
    await checkAdoption(async () => {
      await click(".identity-candidate .identity-adopt");
      record = await until(async () => {
        const value = await api.bookIdentity.get({ book });
        return value.adopted.synopsis ? value : null;
      }, "synopsis adoption");
    });
    record = await run("book-cover-design");
    const coverRound = record.rounds.find((round) => round.field === "cover")!;
    ensure(
      coverRound.field === "cover" && coverRound.candidates.length === 2,
      "wrong cover candidate count"
    );
    record = await until(async () => {
      const record = await api.bookIdentity.get({ book });
      const round = record.rounds.find((entry) => entry.id === coverRound.id);
      return round?.field === "cover" &&
        round.candidates.every((candidate) => candidate.images.length === 1)
        ? record
        : null;
    }, "automatically rendered cover plans");
    const savedCoverRound = record.rounds.find(
      (round) => round.id === coverRound.id
    )!;
    if (savedCoverRound.field !== "cover")
      throw new Error("Missing cover round.");
    const candidate = savedCoverRound.candidates[0]!;
    const asset = candidate.images[0]!;
    ensure(
      asset?.width === 600 && asset.height === 800,
      "image decode and persistence failed"
    );
    record = await api.bookIdentity.get({ book });
    const thumb = await loadImage(asset.thumb, record.revision);
    ensure(
      Math.max(thumb.naturalWidth, thumb.naturalHeight) === 480,
      "thumbnail is not 480 px"
    );
    const original = await loadImage(asset.file, record.revision);
    const canvas = document.createElement("canvas");
    canvas.width = original.naturalWidth;
    canvas.height = original.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(original, 0, 0);
    context.font = "48px serif";
    context.fillStyle = "#ffffff";
    context.fillText(record.adopted.title!.title, 40, 100);
    record = await api.bookIdentity.saveComposedCover({
      book,
      roundId: coverRound.id,
      candidateId: candidate.id,
      imageId: asset.id,
      layout: {
        template: "top-center",
        title: record.adopted.title!.title,
        subtitle: "",
        author: "",
        fontFamily: "serif",
        fontWeight: 700,
        fontSize: 48,
        color: "#ffffff",
        stroke: false,
        shadow: false
      },
      pngBase64: canvas.toDataURL("image/png").split(",")[1]!
    });
    await until(() => {
      const image = document.querySelector<HTMLImageElement>(
        ".identity-candidate img"
      );
      return image?.src.includes(".composed.png") && image.complete;
    }, "composed candidate preview");
    await checkAdoption(async () => {
      await click(".identity-candidate .identity-adopt");
      record = await until(async () => {
        const value = await api.bookIdentity.get({ book });
        return value.adopted.cover?.imageId === asset.id ? value : null;
      }, "cover adoption");
    });
    const adopted = await loadImage("cover.png", record.revision);
    ensure(adopted.naturalWidth === 600, "adopted cover protocol failed");
    ensure(updatedEvents >= 6, "Core update events not forwarded");
    return {
      status: "ok",
      adoptionChecks,
      book,
      runtime: "local-faux",
      rounds: record.rounds.length,
      titleAdopted: true,
      renamed: true,
      thumbnail: true,
      composed: true,
      coverAdopted: true,
      updatedEvents,
      revision: record.revision,
      imageFile: asset.file,
      thumbFile: asset.thumb,
      composedFile: `covers/${asset.id}.composed.png`
    };
  } finally {
    unsubscribeUpdates();
  }
}
