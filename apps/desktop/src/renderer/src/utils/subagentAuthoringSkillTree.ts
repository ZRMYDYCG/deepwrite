import {
  SUBAGENT_AUTHORING_SKILL_BODY_MAX_LENGTH,
  SkillStageIdSchema,
  type SkillKind,
  type SkillLibrary,
  type SkillStageId
} from "@deepwrite/contracts/renderer";

/** One selectable skill entry, flattened out of its library. */
export interface SubagentAuthoringSkillOption {
  id: string;
  libraryId: string;
  entryId: string;
  libraryTitle: string;
  libraryKind: SkillKind;
  libraryBuiltin: boolean;
  title: string;
  body: string;
  stageId: SkillStageId;
}

export interface SkillTreeStageNode {
  key: string;
  stageId: SkillStageId;
  skills: SubagentAuthoringSkillOption[];
}

export interface SkillTreeLibraryNode {
  key: string;
  libraryId: string;
  title: string;
  kind: SkillKind;
  builtin: boolean;
  count: number;
  stages: SkillTreeStageNode[];
}

/** Up to this many skills the whole tree opens expanded. */
const EXPAND_ALL_SKILL_LIMIT = 20;

export function buildSubagentAuthoringSkillOptions(
  libraries: readonly SkillLibrary[]
): SubagentAuthoringSkillOption[] {
  return libraries.flatMap((library) =>
    library.entries.map((entry) => ({
      id: `skill:${library.id}:${entry.id}`,
      libraryId: library.id,
      entryId: entry.id,
      libraryTitle: library.title,
      libraryKind: library.skillKind,
      libraryBuiltin: library.isBuiltin,
      title: entry.title,
      body: entry.body.slice(0, SUBAGENT_AUTHORING_SKILL_BODY_MAX_LENGTH),
      stageId: entry.stageId
    }))
  );
}

/**
 * Library → stage → skill. Libraries keep their given order, stages follow the
 * canonical stage order and empty groups are dropped. A non-empty query keeps
 * the skills whose title, library or stage label contains it.
 */
export function buildSkillTree(
  options: readonly SubagentAuthoringSkillOption[],
  query: string,
  stageLabel: (stageId: SkillStageId) => string
): SkillTreeLibraryNode[] {
  const needle = query.trim().toLowerCase();
  const matches = (option: SubagentAuthoringSkillOption): boolean =>
    !needle ||
    [option.title, option.libraryTitle, stageLabel(option.stageId)].some(
      (text) => text.toLowerCase().includes(needle)
    );

  const libraries = new Map<string, SubagentAuthoringSkillOption[]>();
  for (const option of options) {
    if (!matches(option)) continue;
    const group = libraries.get(option.libraryId);
    if (group) group.push(option);
    else libraries.set(option.libraryId, [option]);
  }

  return [...libraries.entries()].map(([libraryId, skills]) => {
    const first = skills[0]!;
    return {
      key: `library:${libraryId}`,
      libraryId,
      title: first.libraryTitle,
      kind: first.libraryKind,
      builtin: first.libraryBuiltin,
      count: skills.length,
      stages: SkillStageIdSchema.options.flatMap((stageId) => {
        const inStage = skills.filter((skill) => skill.stageId === stageId);
        return inStage.length
          ? [{ key: `stage:${libraryId}:${stageId}`, stageId, skills: inStage }]
          : [];
      })
    };
  });
}

export function allSkillTreeKeys(
  tree: readonly SkillTreeLibraryNode[]
): Set<string> {
  return new Set(
    tree.flatMap((library) => [
      library.key,
      ...library.stages.map((stage) => stage.key)
    ])
  );
}

/** Small trees open fully; larger ones only open the first library. */
export function defaultExpandedSkillTreeKeys(
  tree: readonly SkillTreeLibraryNode[]
): Set<string> {
  const total = tree.reduce((sum, library) => sum + library.count, 0);
  if (total <= EXPAND_ALL_SKILL_LIMIT) return allSkillTreeKeys(tree);
  return allSkillTreeKeys(tree.slice(0, 1));
}
