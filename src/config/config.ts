require("dotenv").config();

export interface AppConfig {
  discord: {
    token: string;
    guildId: string;
    channelId: string;
  };
  vosk: {
    modelPath: string;
    englishModelPath: string;
    sampleRate: number;
  };
  audio: {
    chunkSize: number;
  };
  music: {
    cacheEnabled: boolean;
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
    englishModelPath: requireEnv("VOSK_MODEL_PATH_EN"),
    sampleRate: parseIntEnv("SAMPLE_RATE", 16000),
  },
  audio: {
    chunkSize: parseIntEnv("CHUNK_SIZE", 4000),
  },
  music: {
    cacheEnabled: process.env.MUSIC_CACHE_ENABLED === "true",
  },
};
