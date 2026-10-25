import * as os from "os";
import * as path from "path";

require("dotenv").config();

export interface AppConfig {
  discord: {
    token: string;
    guildId: string;
    channelId: string;
  };
  vosk: {
    modelPath: string;
    sampleRate: number;
  };
  audio: {
    chunkSize: number;
  };
  music: {
    cacheEnabled: boolean;
    notificationChannelId: string;
  };
  whisper: {
    modelPath: string;
    cudaLibPath: string;
  };
  llm: {
    model: string;
    baseUrl: string;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Check your .env file.`
    );
  }
  return value;
}

function parseIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid environment variable ${name}: "${raw}" is not a number.`);
  }
  return parsed;
}

export const config: AppConfig = {
  discord: {
    token: requireEnv("DISCORD_BOT_TOKEN"),
    guildId: requireEnv("DISCORD_SERVER_ID"),
    channelId: requireEnv("DISCORD_SERVER_CHANNEL_ID"),
  },
  vosk: {
    modelPath: requireEnv("VOSK_MODEL_PATH"),
    sampleRate: parseIntEnv("SAMPLE_RATE", 16000),
  },
  audio: {
    chunkSize: parseIntEnv("CHUNK_SIZE", 4000),
  },
  music: {
    cacheEnabled: process.env.MUSIC_CACHE_ENABLED === "true",
    notificationChannelId: process.env.MUSIC_NOTIFICATION_CHANNEL_ID || "",
  },
  whisper: {
    modelPath: process.env.WHISPER_MODEL_PATH || "./whisper/models/ggml-small.bin",
    cudaLibPath: process.env.CUDA_LIB_PATH || path.join(os.homedir(), "cuda-toolkit", "lib64"),
  },
  llm: {
    model: process.env.OLLAMA_MODEL || "hf.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q8_0",
    baseUrl: process.env.OLLAMA_BASE_URL || "",
  },
};
