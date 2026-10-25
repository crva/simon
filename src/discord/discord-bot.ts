import {
  AudioPlayer,
  entersState,
  EndBehaviorType,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { Client, GatewayIntentBits } from "discord.js";
import { createOpusToVoskTransform, stopCurrentStream, streamMusic } from "../audio";
import { config } from "../config";
import { ParsedCommand, parseCommand } from "../llm";
import { logger } from "../utils";
import { VoskManager } from "../vosk";
import { transcribeWithWhisper } from "../whisper";
import {
  MusicQueue,
  parseDuration,
  resolveTrack,
  sendCommandEmbed,
  sendMessage,
  sendMusicEmbed,
  Track,
} from "./commands";

// Vosk consistently mishears "simon" as these near-homophones, so we treat
// them as equivalent wake words instead of fighting the model's accuracy.
// This is just a cheap pre-filter (anywhere in the phrase, not just the
// start) to decide whether an utterance is worth the cost of Whisper + LLM —
// the actual command is parsed from Whisper's transcript, not Vosk's.
const WAKE_WORD_VARIANTS = ["simon", "c'est mon", "cest mon", "six mots", "ces mots", "si mon"];

function matchesWakeWord(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return WAKE_WORD_VARIANTS.some((variant) => normalized.includes(variant));
}

export class DiscordBot {
  private client: Client;
  private voskManager: VoskManager;
  private audioPlayer: AudioPlayer;
  private currentConnection: VoiceConnection | null = null;
  private activeSpeakers: Set<string> = new Set();
  private musicQueue: MusicQueue = new MusicQueue();
  private currentTrack: Track | null = null;

  constructor(voskManager: VoskManager) {
    this.voskManager = voskManager;
    this.audioPlayer = new AudioPlayer();

    this.audioPlayer.on("error", (error) => {
      logger.error({ error }, "❌ AudioPlayer error");
    });

    // Auto-advance: whenever playback goes idle (track ended, or was
    // skipped/stopped), play whatever's next in the queue, if anything
    this.audioPlayer.on("stateChange", (oldState, newState) => {
      if (newState.status === "idle" && oldState.status !== "idle") {
        const next = this.musicQueue.next();
        if (next) {
          this.playTrack(next);
        }
      }
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
        logger.error({ error }, "❌ Initialization error");
        process.exit(1);
      }
    });

    this.client.on("error", (error) => {
      logger.error({ error }, "❌ Discord client error");
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

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      logger.warn("⚠️ Disconnected from voice channel, attempting to reconnect...");
      try {
        // Discord sometimes disconnects/reconnects us itself (e.g. the voice
        // server moved) — give it a few seconds before rejoining manually
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        try {
          connection.destroy();
        } catch {
          // already destroyed
        }
        try {
          await this.initializeVoiceConnection();
        } catch (error) {
          logger.error({ error }, "❌ Failed to reconnect to voice channel");
        }
      }
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
        { activeSpeakers: this.activeSpeakers.size },
        `🎯 User ${userId} started speaking`
      );
      this.handleUserSpeech(connection, userId);
    });
  }

  /**
   * Handle speech recognition for a specific user
   */
  private handleUserSpeech(connection: VoiceConnection, userId: string): void {
    if (this.activeSpeakers.has(userId)) {
      return;
    }
    this.activeSpeakers.add(userId);

    const recognizer = this.voskManager.createRecognizer();
    // Buffered so the full utterance can be re-transcribed by Whisper if
    // Vosk's cheap pass below flags it as plausibly containing the wake word
    const audioChunks: Buffer[] = [];

    const audioStream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000,
      },
    });

    const audioTransform = createOpusToVoskTransform();
    let hasPartialResult = false;
    // Serialize chunk processing per speaker: koffi runs each native call on
    // a worker thread, so without this, overlapping calls could race on the
    // same recognizer handle if chunks arrive faster than they're processed
    let processingQueue: Promise<void> = Promise.resolve();

    audioStream
      .pipe(audioTransform)
      .on("data", (chunk: Buffer) => {
        audioChunks.push(chunk);

        processingQueue = processingQueue.then(async () => {
          const partialText = await this.voskManager.processAudioChunk(recognizer, chunk);
          if (partialText) {
            logger.debug(`🎤 Partial: ${partialText}`);
            hasPartialResult = true;
          }
        });
      })
      .on("end", async () => {
        await processingQueue;
        const finalText = await this.voskManager.getFinalResult(recognizer);
        recognizer.free();
        this.activeSpeakers.delete(userId);

        if (!finalText) {
          if (!hasPartialResult) {
            logger.debug("❌ No speech detected");
          }
          return;
        }

        if (!matchesWakeWord(finalText)) {
          logger.debug(`🔇 Ignored (no wake word): ${finalText}`);
          return;
        }

        logger.info(`✅ Vosk (pre-filter): ${finalText}`);
        const whisperText = await transcribeWithWhisper(
          Buffer.concat(audioChunks),
          config.vosk.sampleRate
        );
        const transcript = whisperText || finalText;
        logger.info(`🤖 Whisper: ${transcript}`);

        const command = await parseCommand(transcript);
        logger.info({ command }, "🧠 Parsed command");
        await this.executeCommand(command, userId);
      })
      .on("error", async (error) => {
        logger.error({ error }, "❌ Audio stream error");
        await processingQueue;
        recognizer.free();
        this.activeSpeakers.delete(userId);
      });
  }

  /**
   * Starts playing a track immediately, replacing whatever was playing
   */
  private playTrack(track: Track): void {
    try {
      const resource = streamMusic(track.url, track.title);
      this.audioPlayer.play(resource);
      this.currentTrack = track;
      logger.info(`🎵 Playing: ${track.title}`);
    } catch (error) {
      logger.error({ error }, "❌ Playback failed");
    }
  }

  /**
   * Seconds left in the currently playing track, used to estimate wait
   * times for newly queued tracks
   */
  private getCurrentTrackRemainingSeconds(): number {
    if (!this.currentTrack?.duration) return 0;
    const state = this.audioPlayer.state;
    if (state.status === "idle") return 0;

    const elapsedSeconds = state.resource.playbackDuration / 1000;
    const totalSeconds = parseDuration(this.currentTrack.duration);
    return Math.max(0, totalSeconds - elapsedSeconds);
  }

  /**
   * Executes the command extracted by the LLM from the Whisper transcript
   */
  private async executeCommand(command: ParsedCommand, userId: string): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(config.discord.guildId);
      if (!guild) {
        logger.error("❌ Guild not found for command execution");
        return;
      }

      switch (command.action) {
        case "message":
          await sendMessage(guild, command.query ?? "", command.channel);
          break;

        case "stop":
          this.musicQueue.clear();
          this.audioPlayer.stop();
          stopCurrentStream();
          logger.info("🛑 Music stopped and queue cleared");
          await sendCommandEmbed(guild, "stop", this.currentTrack, userId);
          break;

        case "skip":
          if (this.audioPlayer.state.status === "idle") {
            logger.info("⏭️ Nothing playing to skip");
          } else {
            this.audioPlayer.stop();
            stopCurrentStream();
            logger.info("⏭️ Skipped current track");
            await sendCommandEmbed(guild, "skip", this.currentTrack, userId);
          }
          break;

        case "pause":
          if (this.audioPlayer.pause()) {
            logger.info("⏸️ Music paused");
            await sendCommandEmbed(guild, "pause", this.currentTrack, userId);
          }
          break;

        case "resume":
          if (this.audioPlayer.unpause()) {
            logger.info("▶️ Music resumed");
            await sendCommandEmbed(guild, "resume", this.currentTrack, userId);
          }
          break;

        case "play": {
          const track = await resolveTrack(command.query ?? "");
          if (!track) return;
          track.requestedBy = userId;

          if (this.audioPlayer.state.status === "idle") {
            this.playTrack(track);
            await sendMusicEmbed(guild, track, "playing");
          } else {
            this.musicQueue.enqueue(track);
            const pending = this.musicQueue.getPending();
            const upcomingPosition = pending.length;
            const tracksAhead = pending.slice(0, -1);
            const estimatedWaitSeconds =
              this.getCurrentTrackRemainingSeconds() +
              tracksAhead.reduce(
                (sum, t) => sum + (t.duration ? parseDuration(t.duration) : 0),
                0
              );

            logger.info(`➕ Added to queue: ${track.title} (position ${upcomingPosition})`);
            await sendMusicEmbed(guild, track, "queued", {
              upcomingPosition,
              estimatedWaitSeconds,
            });
          }
          break;
        }

        case "none":
          logger.debug("❓ No matching voice command found");
          break;
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
      logger.error({ error }, "❌ Login failed");
      throw error;
    }
  }

  /**
   * Stop the bot and cleanup resources
   */
  async stop(): Promise<void> {
    logger.info("🛑 Stopping bot...");
    this.audioPlayer.stop();
    stopCurrentStream();
    if (this.currentConnection) {
      this.currentConnection.destroy();
    }
    await this.client.destroy();
  }
}
