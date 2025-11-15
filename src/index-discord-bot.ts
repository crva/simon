import * as opus from "@discordjs/opus";
import {
  EndBehaviorType,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { Client, GatewayIntentBits } from "discord.js";
import { Transform } from "stream";
import * as vosk from "vosk";
require("dotenv").config();

// Configuration
const CONFIG = {
  TOKEN: process.env.DISCORD_BOT_TOKEN!,
  GUILD_ID: process.env.DISCORD_SERVER_ID!,
  CHANNEL_ID: process.env.DISCORD_SERVER_CHANNEL_ID!,
  MODEL_PATH: "./vosk/models/vosk-model-small-fr-0.22",
  SAMPLE_RATE: 16000,
  CHUNK_SIZE: 4000,
} as const;

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Initialize Vosk model
let model: vosk.Model;
try {
  vosk.setLogLevel(-1);
  model = new vosk.Model(CONFIG.MODEL_PATH);
  console.log("✅ Vosk model loaded successfully");
} catch (error) {
  console.error("❌ Failed to load Vosk model:", error);
  process.exit(1);
}

/**
 * Creates a transform stream that converts Discord Opus audio to Vosk-compatible PCM format
 * Discord: Opus encoded → PCM 48kHz stereo 16-bit
 * Vosk: PCM 16kHz mono 16-bit
 */
function createAudioTransform(): Transform {
  let audioBuffer = Buffer.alloc(0);
  const opusDecoder = new opus.OpusEncoder(48000, 2);

  return new Transform({
    transform(chunk: Buffer, encoding, callback) {
      try {
        // Decode Opus to PCM 48kHz stereo
        const decodedPCM = opusDecoder.decode(chunk);
        if (!decodedPCM || decodedPCM.length === 0) {
          callback();
          return;
        }

        // Convert PCM 48kHz stereo to 16kHz mono
        const convertedPCM = convertAudioFormat(decodedPCM);
        audioBuffer = Buffer.concat([audioBuffer, convertedPCM]);

        // Send chunks of appropriate size
        while (audioBuffer.length >= CONFIG.CHUNK_SIZE) {
          const chunkToSend = audioBuffer.slice(0, CONFIG.CHUNK_SIZE);
          audioBuffer = audioBuffer.slice(CONFIG.CHUNK_SIZE);
          this.push(chunkToSend);
        }

        callback();
      } catch (error) {
        console.error("Audio transform error:", error);
        callback();
      }
    },

    flush(callback) {
      if (audioBuffer.length > 0) {
        this.push(audioBuffer);
      }
      callback();
    },
  });
}

/**
 * Converts audio from 48kHz stereo to 16kHz mono format
 */
function convertAudioFormat(pcmData: Buffer): Buffer {
  const stereoSamples = Math.floor(pcmData.length / 4);
  const monoSamples = Math.floor(stereoSamples / 3); // Downsample 48kHz → 16kHz
  const outputBuffer = Buffer.alloc(monoSamples * 2);

  for (let i = 0; i < monoSamples; i++) {
    const stereoIndex = i * 3;
    const byteIndex = stereoIndex * 4;

    if (byteIndex + 3 < pcmData.length) {
      let leftSample = pcmData.readInt16LE(byteIndex);
      let rightSample = pcmData.readInt16LE(byteIndex + 2);

      // Handle potential overflow
      if (leftSample > 32767) leftSample -= 65536;
      if (rightSample > 32767) rightSample -= 65536;

      // Convert stereo to mono and clamp
      const monoSample = Math.floor((leftSample + rightSample) / 2);
      const clampedSample = Math.max(-32768, Math.min(32767, monoSample));

      outputBuffer.writeInt16LE(clampedSample, i * 2);
    }
  }

  return outputBuffer;
}

/**
 * Handles speech recognition for a user's audio stream
 */
function handleUserSpeech(connection: VoiceConnection, userId: string): void {
  const recognizer = new vosk.Recognizer({
    model,
    sampleRate: CONFIG.SAMPLE_RATE,
  });

  const audioStream = connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 1000,
    },
  });

  const audioTransform = createAudioTransform();
  let hasPartialResult = false;

  audioStream
    .pipe(audioTransform)
    .on("data", (chunk: Buffer) => {
      try {
        if (recognizer.acceptWaveform(chunk)) {
          const result = recognizer.result();
          const parsedResult = JSON.parse(result);

          if (parsedResult.text?.trim()) {
            console.log("🎤 Partial:", parsedResult.text);
            hasPartialResult = true;
          }
        }
      } catch (error) {
        console.error("Recognition error:", error);
      }
    })
    .on("end", () => {
      try {
        const finalResult = recognizer.finalResult();

        if (finalResult.text?.trim()) {
          console.log("✅ Final transcription:", finalResult.text);
        } else if (!hasPartialResult) {
          console.log("❌ No speech detected");
        }
      } catch (error) {
        console.error("Final result error:", error);
      } finally {
        recognizer.free();
      }
    })
    .on("error", (error) => {
      console.error("Audio stream error:", error);
      recognizer.free();
    });
}

/**
 * Sets up voice connection and speech recognition
 */
async function setupVoiceRecognition(
  connection: VoiceConnection
): Promise<void> {
  const receiver = connection.receiver;

  receiver.speaking.on("start", (userId) => {
    console.log(`🎯 User ${userId} started speaking`);
    handleUserSpeech(connection, userId);
  });
}

/**
 * Main bot initialization
 */
async function initializeBot(): Promise<void> {
  const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
  if (!guild) {
    throw new Error("Guild not found");
  }

  const channel = guild.channels.cache.get(CONFIG.CHANNEL_ID);
  if (!channel?.isVoiceBased()) {
    throw new Error("Voice channel not found");
  }

  const connection = joinVoiceChannel({
    channelId: CONFIG.CHANNEL_ID,
    guildId: CONFIG.GUILD_ID,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log("🔊 Connected to voice channel");
    setupVoiceRecognition(connection);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    console.log("❌ Disconnected from voice channel");
  });
}

// Event handlers
client.on("ready", async () => {
  console.log(`🤖 Bot logged in as ${client.user?.tag}`);

  try {
    await initializeBot();
  } catch (error) {
    console.error("Initialization error:", error);
    process.exit(1);
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

// Start the bot
console.log("🚀 Starting Discord voice transcription bot...");
client.login(CONFIG.TOKEN).catch((error) => {
  console.error("Login failed:", error);
  process.exit(1);
});
