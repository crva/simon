import * as fs from "fs";
import * as vosk from "vosk";
import { WaveFile } from "wavefile";

const MODEL_PATH = "./vosk/models/vosk-model-small-fr-0.22";
const AUDIO_FILE_PATH = "./audio/test.wav";
const SAMPLE_RATE = 16000;
const CHUNK_SIZE = 4000;

interface WaveFileWithFormat extends WaveFile {
  fmt: {
    numChannels: number;
    sampleRate: number;
  };
}

function transcribeAudio(): void {
  vosk.setLogLevel(0);

  const model = new vosk.Model(MODEL_PATH);
  const recognizer = new vosk.Recognizer({ model, sampleRate: SAMPLE_RATE });

  const audioBuffer = fs.readFileSync(AUDIO_FILE_PATH);
  const wav = new WaveFile(audioBuffer) as WaveFileWithFormat;
  const samples = wav.getSamples();

  if (wav.fmt.numChannels !== 1 || wav.fmt.sampleRate !== SAMPLE_RATE) {
    console.error("Audio file must be WAV, 16kHz, 16-bit PCM, mono.");
    process.exit(1);
  }

  const buffer = convertSamplesToBuffer(samples);
  processAudioChunks(recognizer, buffer);

  const result = recognizer.finalResult();
  console.log("Final transcription:", result.text);

  recognizer.free();
  model.free();
}

function convertSamplesToBuffer(samples: Float64Array): Buffer {
  const buffer = Buffer.alloc(samples.length * 2);

  for (let i = 0; i < samples.length; i++) {
    let sample = samples[i];
    if (sample !== undefined && sample > 32767) {
      sample -= 65536;
    }
    if (sample !== undefined) {
      buffer.writeInt16LE(sample, i * 2);
    }
  }

  return buffer;
}

function processAudioChunks(recognizer: vosk.Recognizer, buffer: Buffer): void {
  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    const chunk = buffer.subarray(i, i + CHUNK_SIZE);
    recognizer.acceptWaveform(chunk);
  }
}

transcribeAudio();
