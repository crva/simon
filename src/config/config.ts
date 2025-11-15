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
}

export const config: AppConfig = {
  discord: {
    token: process.env.DISCORD_BOT_TOKEN!,
    guildId: process.env.DISCORD_SERVER_ID!,
    channelId: process.env.DISCORD_SERVER_CHANNEL_ID!,
  },
  vosk: {
    modelPath: process.env.VOSK_MODEL_PATH!,
    sampleRate: parseInt(process.env.SAMPLE_RATE || "16000"),
  },
  audio: {
    chunkSize: parseInt(process.env.CHUNK_SIZE || "4000"),
  },
};

// Validate required environment variables
function validateConfig(): void {
  const required = [
    config.discord.token,
    config.discord.guildId,
    config.discord.channelId,
    config.vosk.modelPath,
  ];

  for (const value of required) {
    if (!value) {
      throw new Error(
        "Missing required environment variables. Check your .env file."
      );
    }
  }
}

validateConfig();
