import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { config } from "../config";
import { logger } from "../utils";

function resolveNativeDir(): string {
  const root = path.resolve(__dirname, "..", "..", "whisper", "native");
  return os.platform() === "win32" ? path.join(root, "win-x64") : path.join(root, "linux-x64");
}

function resolveBinaryPath(): string {
  const dir = resolveNativeDir();
  return os.platform() === "win32" ? path.join(dir, "whisper-cli.exe") : path.join(dir, "whisper-cli");
}

// The vendored binary is CUDA-enabled but only ships its own small ggml/whisper
// shared libs — the much larger CUDA runtime libs (libcublasLt alone is
// ~500MB) stay wherever the CUDA toolkit is installed on this machine rather
// than being vendored into the repo.
function resolveLibraryPath(): string {
  const dirs = [resolveNativeDir()];
  if (config.whisper.cudaLibPath) {
    dirs.push(config.whisper.cudaLibPath);
  }
  return dirs.join(path.delimiter);
}

// Whisper hallucinates (URLs, "subscribe" boilerplate, etc.) when fed mostly
// silence, which happens here because the voice receiver keeps streaming up
// to a second of dead air before closing the utterance. Trim near-silent
// frames off both ends before handing audio to whisper.
function trimSilence(pcm: Buffer, sampleRate: number): Buffer {
  const frameBytes = Math.floor(sampleRate * 0.02) * 2; // 20ms frames
  const rmsThreshold = 400; // out of a 0-32767 PCM16 amplitude range

  function frameRms(byteOffset: number): number {
    const end = Math.min(byteOffset + frameBytes, pcm.length - (pcm.length % 2));
    let sumSquares = 0;
    let count = 0;
    for (let i = byteOffset; i + 1 < end; i += 2) {
      const sample = pcm.readInt16LE(i);
      sumSquares += sample * sample;
      count++;
    }
    return count > 0 ? Math.sqrt(sumSquares / count) : 0;
  }

  let start = 0;
  while (start < pcm.length && frameRms(start) < rmsThreshold) {
    start += frameBytes;
  }

  let end = pcm.length;
  while (end > start && frameRms(Math.max(start, end - frameBytes)) < rmsThreshold) {
    end -= frameBytes;
  }

  return pcm.subarray(start, Math.max(start, end));
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

const MIN_SPEECH_MS = 300;

/**
 * Transcribes a buffer of 16kHz mono PCM16LE audio using the vendored
 * whisper.cpp CLI. Runs as a one-shot batch call (not streaming) on the
 * full utterance, once Vosk's cheap streaming pass has already flagged it
 * as plausibly containing the wake word.
 */
export async function transcribeWithWhisper(
  pcm: Buffer,
  sampleRate: number
): Promise<string | null> {
  const trimmed = trimSilence(pcm, sampleRate);
  const speechMs = (trimmed.length / 2 / sampleRate) * 1000;
  if (speechMs < MIN_SPEECH_MS) {
    logger.debug(`🤖 Whisper: skipped (only ${Math.round(speechMs)}ms of speech)`);
    return null;
  }

  const binaryPath = resolveBinaryPath();
  const modelPath = path.resolve(config.whisper.modelPath);
  const tmpFile = path.join(os.tmpdir(), `simon-whisper-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);

  fs.writeFileSync(tmpFile, pcmToWav(trimmed, sampleRate));

  try {
    const transcript = await new Promise<string>((resolve, reject) => {
      const libPath = resolveLibraryPath();
      const existingLibPath = process.env.LD_LIBRARY_PATH;
      const proc = spawn(
        binaryPath,
        ["-m", modelPath, "-f", tmpFile, "-l", "auto", "-nt", "-np"],
        {
          env: {
            ...process.env,
            LD_LIBRARY_PATH: existingLibPath ? `${libPath}${path.delimiter}${existingLibPath}` : libPath,
          },
        }
      );

      let stdout = "";
      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`whisper-cli exited with code ${code}`));
          return;
        }
        resolve(stdout);
      });
    });

    const cleaned = transcript.trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch (error) {
    logger.error({ error }, "❌ Whisper transcription failed");
    return null;
  } finally {
    fs.unlink(tmpFile, () => {});
  }
}
