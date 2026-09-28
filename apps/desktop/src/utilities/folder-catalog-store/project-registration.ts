import { resolve } from "node:path";
import type { CreativePlotStage } from "@deepwrite/contracts";
import type { FolderCatalogRegistry, RegistryProject } from "./registry-types";
import {
  mergeCreativePlotStageDefinitions,
  sameCreativePlotStageDefinitions
} from "./plot-stage-definitions";

/** Publish imported definitions with the registration without rewriting projects. */
export async function registerCatalogProject(
  registry: FolderCatalogRegistry,
  project: RegistryProject,
  plotStages: readonly CreativePlotStage[],
  context: {
    secureProjectRoot: (path: string) => Promise<string>;
    pathExists: (path: string) => Promise<boolean>;
    now: () => string;
    writeRegistry: (registry: FolderCatalogRegistry) => Promise<void>;
  }
): Promise<void> {
  const normalizedDirectory = await context.secureProjectRoot(
    project.projectDirectory
  );
  const current = registry.projects.find(
    ({ id, domain }) => id === project.id && domain === project.domain
  );
  const duplicateDirectory = registry.projects.find(
    ({ projectDirectory }) => resolve(projectDirectory) === normalizedDirectory
  );
  if (
    duplicateDirectory &&
    (duplicateDirectory.id !== project.id ||
      duplicateDirectory.domain !== project.domain)
  )
    throw new Error("该目录已经注册为另一个项目。");
  const alreadyRegistered =
    current && resolve(current.projectDirectory) === normalizedDirectory;
  if (
    current &&
    !alreadyRegistered &&
    (await context.pathExists(current.projectDirectory))
  )
    throw new Error(
      "相同项目 ID 已在另一个仍然存在的文件夹中注册。请修改副本的 deepwrite.json ID，或先移动原项目后再重新打开。"
    );

  const creativePlotStages = mergeCreativePlotStageDefinitions(
    registry.creativePlotStages,
    plotStages
  );
  if (
    alreadyRegistered &&
    sameCreativePlotStageDefinitions(
      registry.creativePlotStages,
      creativePlotStages
    )
  )
    return;
  const projects = alreadyRegistered
    ? registry.projects
    : [
        ...registry.projects.filter(
          ({ id, domain, projectDirectory }) =>
            !(id === project.id && domain === project.domain) &&
            resolve(projectDirectory) !== normalizedDirectory
        ),
        { ...project, projectDirectory: normalizedDirectory }
      ];
  await context.writeRegistry({
    ...registry,
    creativePlotStages,
    revision: registry.revision + 1,
    updatedAt: context.now(),
    projects
  });
}
