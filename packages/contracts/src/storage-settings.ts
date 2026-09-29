import { z } from "zod";
import { EnvelopeBaseSchema } from "./envelope";
import type { WorkspaceDirectorySettings } from "./workspace-directory";

export const StorageLocationSchema = z
  .object({
    path: z.string().min(1),
    defaultPath: z.string().min(1),
    isDefault: z.boolean()
  })
  .strict();
export type StorageLocation = z.infer<typeof StorageLocationSchema>;

export const StorageSettingsSnapshotSchema = z
  .object({
    userData: StorageLocationSchema,
    workspace: StorageLocationSchema
  })
  .strict();
export type StorageSettingsSnapshot = z.infer<
  typeof StorageSettingsSnapshotSchema
>;

export const StorageDirectoryKindSchema = z.enum(["user-data", "workspace"]);
export type StorageDirectoryKind = z.infer<typeof StorageDirectoryKindSchema>;

export const StorageChangeResultSchema = z
  .object({ restarting: z.boolean() })
  .strict();
export type StorageChangeResult = z.infer<typeof StorageChangeResultSchema>;

export const StorageOpenDirectoryInputSchema = z
  .object({ kind: StorageDirectoryKindSchema })
  .strict();
export const StorageOpenDirectoryResultSchema = z
  .object({ opened: z.literal(true) })
  .strict();

export const StorageSettingsGetCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("storageSettings.get"),
    payload: z.object({}).strict()
  });

export const StorageSettingsChooseUserDataCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("storageSettings.chooseUserData"),
    payload: z.object({}).strict()
  });

export const StorageSettingsResetUserDataCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("storageSettings.resetUserData"),
    payload: z.object({}).strict()
  });

export const StorageSettingsResetWorkspaceDirectoryCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("storageSettings.resetWorkspaceDirectory"),
    payload: z.object({}).strict()
  });

export const StorageSettingsOpenDirectoryCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("storageSettings.openDirectory"),
    payload: StorageOpenDirectoryInputSchema
  });

export const StorageSettingsCommandSchemas = [
  StorageSettingsGetCommandEnvelopeSchema,
  StorageSettingsChooseUserDataCommandEnvelopeSchema,
  StorageSettingsResetUserDataCommandEnvelopeSchema,
  StorageSettingsResetWorkspaceDirectoryCommandEnvelopeSchema,
  StorageSettingsOpenDirectoryCommandEnvelopeSchema
] as const;

export interface StorageSettingsApi {
  get(): Promise<StorageSettingsSnapshot>;
  chooseUserData(): Promise<StorageChangeResult>;
  resetUserData(): Promise<StorageChangeResult>;
  resetWorkspaceDirectory(): Promise<WorkspaceDirectorySettings>;
  openDirectory(kind: StorageDirectoryKind): Promise<void>;
}
