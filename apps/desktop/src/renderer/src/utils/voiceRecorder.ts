import { createScopedTranslator } from "../i18n";
import { VOICE_MAX_DURATION_MS } from "@deepwrite/contracts/renderer";
import { encodeVoiceWav, type RecordedVoice } from "./voiceAudio";

const t = createScopedTranslator("workspace.voiceRecorder");

export interface VoiceRecorder {
  stop(): RecordedVoice;
  cancel(): void;
}

export interface VoiceRecorderOptions {
  microphoneId: string;
  signal: AbortSignal;
  onProgress: (elapsedMs: number, level: number) => void;
  onLimit: () => void;
  onEnded: () => void;
}

export async function createVoiceRecorder(
  options: VoiceRecorderOptions
): Promise<VoiceRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      ...(options.microphoneId
        ? { deviceId: { exact: options.microphoneId } }
        : {})
    },
    video: false
  });
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let processor: ScriptProcessorNode | undefined;
  let silence: GainNode | undefined;
  let closed = false;
  let frameCount = 0;
  let chunks: Float32Array[] = [];
  const tracks = stream.getTracks();
  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    options.signal.removeEventListener("abort", cleanup);
    for (const track of tracks) {
      track.removeEventListener("ended", options.onEnded);
      track.stop();
    }
    if (processor) processor.onaudioprocess = null;
    source?.disconnect();
    processor?.disconnect();
    silence?.disconnect();
    void context?.close().catch(() => undefined);
  };
  try {
    if (options.signal.aborted)
      throw new DOMException(t("recordingCanceled"), "AbortError");
    options.signal.addEventListener("abort", cleanup, { once: true });
    context = new AudioContext();
    const sampleRate = context.sampleRate;
    const maxFrames = Math.floor((VOICE_MAX_DURATION_MS * sampleRate) / 1_000);
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(4_096, 1, 1);
    silence = context.createGain();
    silence.gain.value = 0;
    processor.onaudioprocess = (event): void => {
      if (closed) return;
      const input = event.inputBuffer.getChannelData(0);
      const sample = input.slice(0, Math.max(0, maxFrames - frameCount));
      chunks.push(sample);
      frameCount += sample.length;
      let energy = 0;
      for (const value of sample) energy += value * value;
      options.onProgress(
        Math.round((frameCount / sampleRate) * 1_000),
        Math.min(1, Math.sqrt(energy / Math.max(1, sample.length)) * 5)
      );
      if (frameCount >= maxFrames) options.onLimit();
    };
    for (const track of tracks)
      track.addEventListener("ended", options.onEnded, { once: true });
    source.connect(processor);
    processor.connect(silence);
    silence.connect(context.destination);
    await context.resume();
    if (options.signal.aborted)
      throw new DOMException(t("recordingCanceled"), "AbortError");
    return {
      stop() {
        cleanup();
        const result = encodeVoiceWav(chunks, sampleRate);
        chunks = [];
        return result;
      },
      cancel() {
        cleanup();
        chunks = [];
      }
    };
  } catch (error) {
    cleanup();
    chunks = [];
    throw error;
  }
}
