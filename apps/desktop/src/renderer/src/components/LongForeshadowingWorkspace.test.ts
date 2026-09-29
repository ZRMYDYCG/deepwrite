import { describe, expect, it } from "vitest";
import { expectSourceToContain } from "../../../test-utils/sourceText";
import deleteDialogSource from "./LongForeshadowingDeleteDialog.vue?raw";
import source from "./LongForeshadowingWorkspace.vue?raw";
import deleteConfirmationSource from "../composables/useLongForeshadowingDeleteConfirmation.ts?raw";

describe("LongForeshadowingWorkspace", () => {
  it("projects one foreshadowing model into overview, volume, and plot-point views", () => {
    expect(source).toContain(
      'type WorkspaceMode = "overview" | "volume" | "plotPoint"'
    );
    expect(source).toContain("foreshadowingOverview");
    expect(source).toContain("automaticVolumeForeshadowingSummary");
    expect(source).toContain("foreshadowingTouchpoints");
    expect(source).toContain("visibleThreads");
    expect(source).toContain("activeThreadBeats");
  });

  it("automatically groups a volume without duplicating stored summaries", () => {
    for (const label of [
      "plantedInThisVolume",
      "developedInThisVolume",
      "resolvedInThisVolume",
      "carriedForward"
    ]) {
      expect(source).toContain(label);
    }
    for (const type of [
      "source",
      "plant",
      "reinforce",
      "misdirect",
      "partial_reveal",
      "reveal",
      "payoff"
    ]) {
      expect(source).toContain(`"${type}"`);
    }
    expect(source).toContain(
      'thread.status === "resolved" || thread.status === "abandoned"'
    );
    expect(source).toContain("hasLaterVolumeBeat || isPlannedCrossVolume");
    expect(source).toContain('status !== "missed"');
  });

  it("creates stable mutually exclusive volume or arc anchors for every touchpoint", () => {
    expect(source).toContain("beat.arcId");
    expect(source).toContain("beat.volumeId");
    expect(source).toContain("arcId: props.plotPointId");
    expect(source).toContain(
      "volumeId: beatDraft.arcId ? null : beatDraft.volumeId || null"
    );
    expect(source).toContain("arcId: beatDraft.arcId || null");
    expect(source).not.toContain("plotPointId: beatDraft");
    expect(source).toContain("thisClearsAutomaticallyWhenYouSelectAPlotPoint");
    expect(source).toContain("whenPlacedAtAPlotPointOnlyThePlot");
    expect(source).toContain("const directArcId = beat.arcId ??");
    expectSourceToContain(
      source,
      'const directVolumeId = directArcId ? "" : (beat.volumeId ?? "")'
    );
    expect(source).toContain(
      "arcById.value.get(arcId)?.volumeId === beat.volumeId"
    );
  });

  it("supports thread and touchpoint CRUD through the shared mutation builder", () => {
    for (const method of [
      "createForeshadowing",
      "updateForeshadowing",
      "createForeshadowingBeat",
      "updateForeshadowingBeat"
    ]) {
      expect(source).toContain(`builder.${method}`);
    }
    expect(deleteConfirmationSource).toContain("builder.deleteForeshadowing");
    expect(deleteConfirmationSource).toContain(
      "builder.deleteForeshadowingBeat"
    );
    expect(source).toContain("hiddenTruth");
    expect(source).toContain("plannedSpan");
    expect(source).toContain(
      "build(createLongStructureMutationBuilder(props.snapshot))"
    );
    expect(source).toContain(
      "const targetThread = thread ?? activeThread.value ?? threads.value[0]"
    );
    expect(source).toContain(
      'formMode.value === "create" ? ("planned" as const) : threadDraft.status'
    );
    expect(source).toContain(`v-if="formMode === 'edit'"`);
  });

  it("captures thread and beat focus and clears stale focus after refresh", () => {
    expect(source).toContain("const activeBeatId = ref<string | null>(null)");
    expect(source).toContain("function selectThread(threadId: string)");
    expect(source).toContain("activeBeatId.value = null");
    expect(source).toContain(
      "function selectBeat(threadId: string, beatId: string)"
    );
    expect(source).toContain("defineExpose({ captureFocus, focusTarget })");
    expect(source).toContain(
      "if (beatId && !thread.beats.some(({ id }) => id === beatId)) return false"
    );
    expect(source).toContain("thread.beats.map((beat)");
    expect(source).toContain("{ 'is-active': activeBeatId === beat.id }");
  });

  it("keeps submitted surfaces locked until the real apply completion", () => {
    expect(source).toContain("completion: LongStructureMutationCompletion");
    expect(source).toContain("const pendingMutation = ref<");
    expect(source).toContain(
      'succeed: () => finishMutation(requestId, "succeeded")'
    );
    expect(source).toContain('fail: () => finishMutation(requestId, "failed")');
    expect(source).toContain("appliedButRefreshFailed");
    expect(source).toContain('if (outcome === "failed") return');
    expect(source).toContain('}, "form")');
  });

  it("keeps committed core fields locked while exposing status-only abandon and restore actions", () => {
    expect(source).toContain("!canBackfillThreadMetadata(activeThread)");
    expect(source).toContain("completeForeshadowingDetails");
    expect(source).toContain("originalThread.hiddenTruth === undefined");
    expect(source).toContain("originalThread.plannedSpan === undefined");
    expect(source).toContain("editingCommittedThread");
    const toggleStart = source.indexOf(
      "function toggleThreadAbandoned(thread: ForeshadowingThread)"
    );
    const toggleEnd = source.indexOf("function closeDelete()", toggleStart);
    const toggleImplementation = source.slice(toggleStart, toggleEnd);
    expect(toggleStart).toBeGreaterThan(-1);
    expect(toggleImplementation).toContain(
      'status: thread.status === "abandoned" ? "planned" : "abandoned"'
    );
    expect(toggleImplementation).toContain('"background"');
    expect(source).toContain("markAbandoned");
    expect(source).toContain("restoreThread");
    expect(source).toContain("updatingStatus");
  });

  it("uses themed popup controls, floating feedback, and accessible teleported dialogs", () => {
    expect(source.match(/\srequired(?:\s|\/?>)/gu)).toHaveLength(1);
    expect(source.match(/<PopupSelect/gu)?.length).toBeGreaterThanOrEqual(8);
    expect(source).not.toContain("<select");
    expect(source).toContain("uiMessage.warning");
    expect(source).toContain("uiMessage.info");
    expect(source.match(/<Teleport to="body">/gu)).toHaveLength(1);
    expect(deleteDialogSource.match(/<Teleport to="body">/gu)).toHaveLength(1);
    expect(deleteDialogSource).toContain('role="alertdialog"');
    expect(deleteDialogSource).toContain(
      'aria-describedby="foreshadow-delete-description"'
    );
    expect(source).toContain("function focusOpenedForm()");
    expect(deleteDialogSource).toContain('ref="cancelButton"');
    for (const token of [
      "--surface-main",
      "--surface-raised",
      "--surface-muted",
      "--surface-hover",
      "--surface-selected",
      "--theme-line",
      "--theme-line-soft",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--accent",
      "--accent-soft",
      "--neutral-solid"
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).toContain("@container (max-width: 38rem)");
    expect(source).toContain("@container (max-width: 28rem)");
  });
});
