import type { BrowserWindow } from "electron";
import type { DeepWriteApi, VoiceSettings } from "@deepwrite/contracts";

async function voiceSmokeInRenderer() {
  const api = (globalThis as unknown as { deepwrite: DeepWriteApi }).deepwrite;
  const ensure = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`Voice smoke: ${message}`);
  };
  const pause = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const original = await api.voice.getSettings();
  ensure(original.profiles.length === 4, "missing provider presets");
  const inputFor = (settings: VoiceSettings) => ({
    ...settings,
    profiles: settings.profiles.map(({ hasApiKey: _hasKey, ...profile }) => ({
      ...profile,
      baseUrl: "https://voice.example.test/v1",
      apiKey: "invalid-smoke-placeholder"
    }))
  });
  const settings = await api.voice.saveSettings(inputFor(original));
  ensure(
    settings.profiles.every((profile) => profile.hasApiKey),
    "keys not saved"
  );
  ensure(
    !JSON.stringify(settings).includes("invalid-smoke-placeholder"),
    "key exposed"
  );
  const bytes = new Uint8Array(32044);
  const view = new DataView(bytes.buffer);
  const label = (at: number, text: string) => {
    for (let index = 0; index < text.length; index++)
      bytes[at + index] = text.charCodeAt(index);
  };
  label(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  label(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, "data");
  view.setUint32(40, 32000, true);
  const audioBase64 = btoa(String.fromCharCode(...bytes));
  const totalBefore = JSON.stringify((await api.modelUsage.query()).totals);
  for (const profile of settings.profiles) {
    const result = await api.voice.transcribe({
      requestId: `smoke_${profile.id}`,
      profileId: profile.id,
      audioBase64,
      durationMs: 1000
    });
    ensure(result.text.includes("语音输入测试"), "missing transcript");
  }
  const usage = await api.voice.getUsage();
  ensure(usage.length === 4, "voice usage not persisted");
  ensure(
    usage.filter((record) => record.totalTokens !== undefined).length === 2,
    "missing usage treated as zero"
  );
  ensure(
    JSON.stringify((await api.modelUsage.query()).totals) === totalBefore,
    "voice leaked into model usage"
  );
  await api.voice.saveSettings({
    ...inputFor(settings),
    profiles: inputFor(settings).profiles.map((profile) => ({
      ...profile,
      model: "smoke-slow"
    }))
  });
  let aborted = false;
  const pending = api.voice
    .transcribe({
      requestId: "smoke_cancel",
      profileId: "mimo-api",
      audioBase64,
      durationMs: 1000
    })
    .catch(() => {
      aborted = true;
    });
  await pause(30);
  await api.voice.cancel({ requestId: "smoke_cancel" });
  await pending;
  ensure(aborted, "cancel did not abort the request");
  await api.voice.saveSettings(inputFor(original));
  return {
    status: "ok",
    profiles: 4,
    isolatedUsage: true,
    cancelled: true,
    secretsHidden: true
  };
}

export async function runVoiceSmoke(window: BrowserWindow) {
  return window.webContents.executeJavaScript(
    `(${voiceSmokeInRenderer.toString()})()`
  );
}
