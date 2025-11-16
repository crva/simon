import {
  AudioPlayer,
  EndBehaviorType,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { Client, GatewayIntentBits } from "discord.js";
import { cleanupAllMusic, createOpusToVoskTransform } from "../audio";
import { config } from "../config";
import { logger } from "../utils";
import { VoskManager } from "../vosk";
import { playMusic, sendMessage } from "./commands";

export class DiscordBot {
  private client: Client;
  private voskManager: VoskManager;
  private audioPlayer: AudioPlayer;
  private currentConnection: VoiceConnection | null = null;
  private isProcessingVoice: boolean = false;

  constructor(voskManager: VoskManager) {
    this.voskManager = voskManager;
    this.audioPlayer = new AudioPlayer();

    // Add debug events for audio player
    this.audioPlayer.on("error", (error) => {
      logger.error({ error }, "❌ AudioPlayer error");
    });

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });

    this.setupEventHandlers();
  }

  /**
   * Setup Discord client event handlers
   */
  private setupEventHandlers(): void {
    this.client.on("clientReady", async () => {
      logger.info(`🤖 Bot logged in as ${this.client.user?.tag}`);

      try {
        await this.initializeVoiceConnection();
      } catch (error) {
        logger.error({ error }, "Initialization error");
        process.exit(1);
      }
    });

    this.client.on("error", (error) => {
      logger.error({ error }, "Discord client error");
    });
  }

  /**
   * Initialize voice connection and setup voice recognition
   */
  private async initializeVoiceConnection(): Promise<void> {
    const guild = this.client.guilds.cache.get(config.discord.guildId);
    if (!guild) {
      throw new Error("Guild not found");
    }

    const channel = guild.channels.cache.get(config.discord.channelId);
    if (!channel?.isVoiceBased()) {
      throw new Error("Voice channel not found");
    }

    const connection = joinVoiceChannel({
      channelId: config.discord.channelId,
      guildId: config.discord.guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    this.currentConnection = connection;

    connection.on(VoiceConnectionStatus.Ready, () => {
      logger.info("🔊 Connected to voice channel");
      this.setupVoiceRecognition(connection);

      // Connect the audio player to the voice connection
      connection.subscribe(this.audioPlayer);
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      logger.info("❌ Disconnected from voice channel");
    });
  }

  /**
   * Setup voice recognition for the connection
   */
  private setupVoiceRecognition(connection: VoiceConnection): void {
    const receiver = connection.receiver;

    receiver.speaking.on("start", (userId) => {
      // Ignore bot users
      const user = this.client.users.cache.get(userId);
      if (user?.bot) {
        logger.debug(`🤖 Ignoring bot user: ${user.username}`);
        return;
      }

      logger.debug(
        { isProcessingVoice: this.isProcessingVoice },
        `🎯 User ${userId} started speaking`
      );
      this.handleUserSpeech(connection, userId);
    });
  }

  /**
   * Lock voice processing to prevent concurrent operations
   */
  private lockVoiceProcessing(): boolean {
    if (this.isProcessingVoice) {
      return false; // Already locked
    }
    this.isProcessingVoice = true;
    return true; // Successfully locked
  }

  /**
   * Unlock voice processing
   */
  private unlockVoiceProcessing(): void {
    this.isProcessingVoice = false;
  }

  /**
   * Handle speech recognition for a specific user
   */
  private handleUserSpeech(connection: VoiceConnection, userId: string): void {
    // Avoid concurrent processing
    if (!this.lockVoiceProcessing()) {
      return;
    }

    const recognizer = this.voskManager.createRecognizer();
    const audioStream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000,
      },
    });

    const audioTransform = createOpusToVoskTransform();
    let hasPartialResult = false;

    audioStream
      .pipe(audioTransform)
      .on("data", (chunk: Buffer) => {
        const partialText = this.voskManager.processAudioChunk(
          recognizer,
          chunk
        );
        if (partialText) {
          logger.debug(`🎤 Partial: ${partialText}`);
          hasPartialResult = true;
        }
      })
      .on("end", async () => {
        const finalText = this.voskManager.getFinalResult(recognizer);

        if (finalText) {
          logger.info(`✅ Final transcription: ${finalText}`);

          // Process voice commands if transcript starts with "simon"
          if (finalText.toLowerCase().startsWith("simon")) {
            await this.processVoiceCommand(finalText, userId);
          }
        } else if (!hasPartialResult) {
          logger.debug("❌ No speech detected");
        }

        recognizer.free();
        this.unlockVoiceProcessing();
      })
      .on("error", (error) => {
        logger.error({ error }, "Audio stream error");
        recognizer.free();
        this.unlockVoiceProcessing();
      });
  }

  /**
   * Process voice command starting with "simon"
   */
  private async processVoiceCommand(
    transcript: string,
    userId: string
  ): Promise<void> {
    const lowercaseTranscript = transcript.toLowerCase();

    logger.info(`🎯 Processing voice command: ${transcript}`);

    try {
      // Get guild for command execution
      const guild = this.client.guilds.cache.get(config.discord.guildId);
      if (!guild) {
        logger.error("❌ Guild not found for command execution");
        return;
      }

      // Command switch
      if (
        lowercaseTranscript.includes("envoie") ||
        lowercaseTranscript.includes("envoi")
      ) {
        logger.info("📝 Executing send message command");
        await sendMessage(guild, transcript);
      } else if (lowercaseTranscript.includes("musique")) {
        logger.info("🎵 Executing play music command");
        // Stop current music if playing to play new one
        if (this.audioPlayer.state.status === "playing") {
          logger.info("🛑 Stopping current music to play new one");
          this.audioPlayer.stop();
        }
        await playMusic(guild, transcript, this.audioPlayer);
      } else if (lowercaseTranscript.includes("stop")) {
        logger.info("🛑 Executing stop music command");
        this.audioPlayer.stop();
        logger.info("✅ Music stopped");
      } else {
        logger.debug("❓ No matching voice command found");
      }
    } catch (error) {
      logger.error({ error }, "❌ Error processing voice command");
    }
  }

  /**
   * Start the Discord bot
   */
  async start(): Promise<void> {
    logger.info("🚀 Starting Discord voice transcription bot...");

    try {
      await this.client.login(config.discord.token);
    } catch (error) {
      logger.error({ error }, "Login failed");
      throw error;
    }
  }

  /**
   * Stop the bot and cleanup resources
   */
  async stop(): Promise<void> {
    logger.info("🛑 Stopping bot...");
    this.audioPlayer.stop();
    cleanupAllMusic();
    if (this.currentConnection) {
      this.currentConnection.destroy();
    }
    await this.client.destroy();
  }
}
