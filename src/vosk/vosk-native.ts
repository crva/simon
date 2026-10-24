import koffi = require("koffi");
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

function resolveLibPath(): string {
  const root = path.resolve(__dirname, "..", "..", "vosk", "native");
  if (os.platform() === "win32") {
    return path.join(root, "win-x64", "libvosk.dll");
  }
  return path.join(root, "linux-x64", "libvosk.so");
}

const lib = koffi.load(resolveLibPath());

const vosk_set_log_level = lib.func("void vosk_set_log_level(int level)");
const vosk_model_new = lib.func("void *vosk_model_new(const char *path)");
const vosk_model_free = lib.func("void vosk_model_free(void *model)");
const vosk_recognizer_new = lib.func(
  "void *vosk_recognizer_new(void *model, float sample_rate)"
);
const vosk_recognizer_free = lib.func(
  "void vosk_recognizer_free(void *recognizer)"
);
const vosk_recognizer_reset = lib.func(
  "void vosk_recognizer_reset(void *recognizer)"
);
const vosk_recognizer_accept_waveform = lib.func(
  "bool vosk_recognizer_accept_waveform(void *recognizer, const uint8_t *data, int length)"
);
const vosk_recognizer_result = lib.func(
  "const char *vosk_recognizer_result(void *recognizer)"
);
const vosk_recognizer_final_result = lib.func(
  "const char *vosk_recognizer_final_result(void *recognizer)"
);
const vosk_recognizer_partial_result = lib.func(
  "const char *vosk_recognizer_partial_result(void *recognizer)"
);

// Run the hot-path decode call on koffi's worker thread pool instead of the
// main thread, so Kaldi decoding doesn't stall the audio player's packet timer
const acceptWaveformAsync = promisify(vosk_recognizer_accept_waveform.async) as (
  recognizer: unknown,
  data: Buffer,
  length: number
) => Promise<boolean>;
const resultAsync = promisify(vosk_recognizer_result.async) as (
  recognizer: unknown
) => Promise<string>;
const finalResultAsync = promisify(vosk_recognizer_final_result.async) as (
  recognizer: unknown
) => Promise<string>;
const partialResultAsync = promisify(vosk_recognizer_partial_result.async) as (
  recognizer: unknown
) => Promise<string>;

export function setLogLevel(level: number): void {
  vosk_set_log_level(level);
}

export class Model {
  readonly handle: unknown;

  constructor(modelPath: string) {
    this.handle = vosk_model_new(modelPath);
  }

  free(): void {
    vosk_model_free(this.handle);
  }
}

export class Recognizer {
  readonly handle: unknown;

  constructor(options: { model: Model; sampleRate: number }) {
    this.handle = vosk_recognizer_new(options.model.handle, options.sampleRate);
  }

  acceptWaveform(chunk: Buffer): Promise<boolean> {
    return acceptWaveformAsync(this.handle, chunk, chunk.length);
  }

  result(): Promise<string> {
    return resultAsync(this.handle);
  }

  finalResult(): Promise<string> {
    return finalResultAsync(this.handle);
  }

  partialResult(): Promise<string> {
    return partialResultAsync(this.handle);
  }

  free(): void {
    vosk_recognizer_free(this.handle);
  }

  // Discards accumulated decoding state so far, so subsequent accept/result
  // calls only reflect audio fed in after the reset
  reset(): void {
    vosk_recognizer_reset(this.handle);
  }
}
