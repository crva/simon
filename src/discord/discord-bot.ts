import {
  AudioPlayer,
  createAudioResource,
  EndBehaviorType,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { Client, GatewayIntentBits } from "discord.js";
import { createOpusToVoskTransform } from "../audio";
import { config } from "../config";
import { TextToSpeech } from "../tts";
import { VoskManager } from "../vosk";
import { sendMessage } from "./commands";

export class DiscordBot {
  private client: Client;
  private voskManager: VoskManager;
  private tts: TextToSpeech;
  private audioPlayer: AudioPlayer;
  private currentConnection: VoiceConnection | null = null;

  constructor(voskManager: VoskManager) {
    this.voskManager = voskManager;
    this.tts = new TextToSpeech();
    this.audioPlayer = new AudioPlayer();
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
      console.log(`🤖 Bot logged in as ${this.client.user?.tag}`);

      try {
        await this.initializeVoiceConnection();
      } catch (error) {
        console.error("Initialization error:", error);
        process.exit(1);
      }
    });

    this.client.on("error", (error) => {
      console.error("Discord client error:", error);
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

    connection.on(VoiceConnectionStatus.Ready, async () => {
      console.log("🔊 Connected to voice channel");
      this.setupVoiceRecognition(connection);

      await this.speak("bonjour");
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      console.log("❌ Disconnected from voice channel");
    });
  }

  /**
   * Setup voice recognition for the connection
   */
  private setupVoiceRecognition(connection: VoiceConnection): void {
    const receiver = connection.receiver;

    receiver.speaking.on("start", (userId) => {
      // console.log(`🎯 User ${userId} started speaking`);
      this.handleUserSpeech(connection, userId);
    });
  }

  /**
   * Handle speech recognition for a specific user
   */
  private handleUserSpeech(connection: VoiceConnection, userId: string): void {
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
          console.log("🎤 Partial:", partialText);
          hasPartialResult = true;
        }
      })
      .on("end", async () => {
        const finalText = this.voskManager.getFinalResult(recognizer);

        if (finalText) {
          console.log("✅ Final transcription:", finalText);

          // Process voice commands if transcript starts with "simon"
          if (finalText.toLowerCase().startsWith("simon")) {
            await this.processVoiceCommand(finalText, userId);
          }
        } else if (!hasPartialResult) {
          console.log("❌ No speech detected");
        }

        recognizer.free();
      })
      .on("error", (error) => {
        console.error("Audio stream error:", error);
        recognizer.free();
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

    console.log(`🎯 Processing voice command: "${transcript}"`);

    try {
      // Get guild for command execution
      const guild = this.client.guilds.cache.get(config.discord.guildId);
      if (!guild) {
        console.log("❌ Guild not found for command execution");
        return;
      }

      // Command switch
      if (
        lowercaseTranscript.includes("envoie") ||
        lowercaseTranscript.includes("envoi")
      ) {
        console.log("📝 Executing send message command");
        await sendMessage(guild, transcript, (text: string) =>
          this.speak(text)
        );
      } else {
        console.log("❓ No matching voice command found");
      }
    } catch (error) {
      console.error("❌ Error processing voice command:", error);
    }
  }

  /**
   * Fait parler le bot dans le canal vocal
   */
  async speak(text: string): Promise<void> {
    try {
      if (!this.currentConnection) {
        console.log("❌ No voice connection available for speaking");
        return;
      }

      console.log(`🗣️ Speaking: "${text}"`);

      // Génère l'audio TTS
      const audioPath = await this.tts.generateSpeech(text);

      // Crée une ressource audio
      const resource = createAudioResource(audioPath);

      // Connecte l'audio player à la connexion vocale
      this.currentConnection.subscribe(this.audioPlayer);

      // Joue l'audio
      this.audioPlayer.play(resource);

      // Nettoie le fichier après lecture
      this.audioPlayer.once("stateChange", (oldState, newState) => {
        if (newState.status === "idle") {
          this.tts.cleanup();
        }
      });
    } catch (error) {
      console.error("❌ Failed to speak:", error);
    }
  }

  /**
   * Start the Discord bot
   */
  async start(): Promise<void> {
    console.log("🚀 Starting Discord voice transcription bot...");

    try {
      await this.client.login(config.discord.token);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  }

  /**
   * Stop the bot and cleanup resources
   */
  async stop(): Promise<void> {
    console.log("🛑 Stopping bot...");
    this.tts.cleanup();
    this.audioPlayer.stop();
    if (this.currentConnection) {
      this.currentConnection.destroy();
    }
    await this.client.destroy();
  }
}
