import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import {
  CommandEnvelopeSchema,
  ExtrasAgentResolvedTaskSchema,
  SystemEventEnvelopeSchema,
  createEnvelope,
  parseSkillMarkdown,
  type CommandEnvelope,
  type DeepWriteApi,
  type ExtrasAgentRunRequest,
  type ModelConfig
} from "@deepwrite/contracts";
import { PiAgentRuntimeAdapter } from "@deepwrite/pi-runtime-adapter";
import { FolderCatalogStore } from "./folder-catalog-store";
import { toEventEnvelope } from "./agent-event-envelope";
import { ExtrasAgentConfigStore } from "../extras/agents/config-store";
import { runExtrasAgent } from "../extras/agents/run-service";
import { useRevisionAnalysis } from "../renderer/src/extras/revision-analysis/useRevisionAnalysis";

function runCommand(request: ExtrasAgentRunRequest) {
  const command = CommandEnvelopeSchema.parse(
    createEnvelope("extrasAgent.run", request, {
      id: "integration-command",
      context: { correlationId: "integration", sessionId: request.sessionId }
    })
  );
  return command as Extract<CommandEnvelope, { type: "extrasAgent.run" }>;
}

describe("revision analysis runtime to persisted skill", () => {
  it("validates runtime events, keeps analysis in memory and persists a reusable skill through Core", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "deepwrite-revision-integration-")
    );
    const store = new FolderCatalogStore({ userDataPath: root });
    const settings = new ExtrasAgentConfigStore(root);
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    let request: ExtrasAgentRunRequest | undefined;
    const api = {
      extrasAgents: {
        run: async (input: ExtrasAgentRunRequest) => {
          request = input;
          return {
            sessionId: input.sessionId,
            runId: "integration-run",
            acceptedAt: new Date().toISOString(),
            runtime: runtime.describe()
          };
        },
        profiles: {
          list: settings.list.bind(settings),
          save: settings.save.bind(settings),
          reset: settings.reset.bind(settings)
        }
      },
      session: { abort: async () => ({}) },
      catalog: { createLibraryEntry: store.createLibraryEntry.bind(store) }
    } as unknown as DeepWriteApi;
    const c = useRevisionAnalysis({ api: () => api });
    try {
      const created = await store.createLibrary({
        domain: "skill",
        name: "修改方向技能",
        skillKind: "general"
      });
      const library = (await store.snapshot()).skills.find(
        (l) => l.id === created.resource.id
      )!;
      c.setConfiguredModels([
        {
          id: "test",
          contextWindow: 200000,
          maxTokens: 16000,
          defaultThinkingLevel: "off",
          thinkingLevelOptions: ["off"]
        } as ModelConfig
      ]);
      await c.loadSettings();
      c.beforeText.value = "她十分悲伤。\n她走出房间。";
      c.afterText.value = "她攥紧衣角，走出房间。";
      c.compare();
      c.changes.value[0]!.reason = "用动作承载情绪";
      await nextTick();
      await c.start();
      await nextTick();
      expect(request?.task).toMatchObject({
        agentId: "revision-analysis",
        profileId: "default"
      });
      // Main rejects missing models before dispatching; the adapter also checks its effective model.
      const dispatched: CommandEnvelope[] = [];
      await expect(
        runExtrasAgent(
          {
            evaluationMode: true,
            configStore: () => settings,
            chatSources: {
              core: async () => {
                throw new Error("not used");
              },
              listModels: async () => ({}),
              queryUsage: async () => ({}),
              appVersion: () => "0.0.0"
            },
            acquireConversation: () => () => undefined,
            resolveModel: async () => undefined,
            resolveContextCompaction: async () => ({
              contextCompactionSettings: {
                enabled: true,
                budgetTokens: 160_000
              }
            }),
            requestAgent: async (command) => {
              dispatched.push(command);
              throw new Error("not dispatched");
            },
            activeRuns: new Map(),
            terminalRuns: new Set(),
            pendingUsageContexts: new Map()
          },
          runCommand(request!)
        )
      ).resolves.toMatchObject({
        status: "rejected",
        error: { message: "请选择可用模型。" }
      });
      expect(dispatched).toEqual([]);
      const task = ExtrasAgentResolvedTaskSchema.parse({
        agentId: "revision-analysis",
        profile: await settings.resolve("revision-analysis", "default"),
        input: request!.task.input
      });
      for await (const event of runtime.startExtras({
        runId: "integration-run",
        spec: { sessionId: request!.sessionId, task }
      })) {
        c.handleEvent(
          SystemEventEnvelopeSchema.parse(toEventEnvelope(event, "integration"))
        );
      }
      await nextTick();
      expect(c.status.value).toBe("completed");
      expect(c.result.value?.report).toContain("用动作承载情绪");
      expect(
        (await store.snapshot()).skills.find((l) => l.id === library.id)!
          .entries
      ).toHaveLength(0);
      c.result.value!.body += "\n用户确认：避免用动作替代所有必要说明。";
      await c.persistSkill(library);
      const reopened = new FolderCatalogStore({ userDataPath: root });
      const saved = (await reopened.snapshot()).skills.find(
        (l) => l.id === library.id
      )!;
      expect(saved.entries).toHaveLength(1);
      expect(saved.entries[0]).toMatchObject({
        stageId: "draft",
        title: c.result.value!.title
      });
      expect(parseSkillMarkdown(saved.entries[0]!.body)).toEqual({
        valid: true,
        name: c.result.value!.title,
        description: c.result.value!.description,
        body: c.result.value!.body
      });
      const book = await reopened.createShortBook({
        title: "技能复用验证",
        genre: "其他",
        linkedSkillIdsByKind: { general: [saved.id] }
      });
      expect(book.resource.linkedSkillIdsByKind.general).toContain(saved.id);
    } finally {
      c.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });
});
