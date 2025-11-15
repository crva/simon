import { AudioPlayer, createAudioResource } from "@discordjs/voice";
import { Guild } from "discord.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import youtubeDl from "youtube-dl-exec";
import yts from "yt-search";

// Create temp directory for audio files
const TEMP_DIR = path.join(os.tmpdir(), "discord-music-bot");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Store current audio file for cleanup
let currentAudioFile: string | null = null;

export async function playMusic(
  guild: Guild,
  transcript: string,
  audioPlayer: AudioPlayer
): Promise<void> {
  try {
    // Extract the search query after "musique"
    const searchQuery = extractMusicQuery(transcript);

    if (!searchQuery) {
      console.log("❌ No music query found");
      return;
    }

    console.log(`🔍 Searching for: "${searchQuery}"`);

    // Search for the song on YouTube
    const searchResults = await yts(searchQuery);
    const videos = searchResults.videos;

    if (!videos || videos.length === 0) {
      console.log("❌ No music found");
      return;
    }

    const video = videos[0];
    if (!video) {
      console.log("❌ No valid video found");
      return;
    }

    console.log(`🎵 Found: "${video.title}" by ${video.author.name}`);
    console.log(`🔗 URL: ${video.url}`);

    // Download and play audio
    await downloadAndPlay(video, audioPlayer);
  } catch (error) {
    console.error("❌ Failed to play music:", error);
  }
}

async function downloadAndPlay(
  video: any,
  audioPlayer: AudioPlayer
): Promise<void> {
  console.log(`🎧 Downloading audio from: ${video.url}`);

  // Clean up previous audio file when song ends
  audioPlayer.on("stateChange", (oldState, newState) => {
    if (
      newState.status === "idle" &&
      currentAudioFile &&
      fs.existsSync(currentAudioFile)
    ) {
      console.log(`🗑️ Cleaning up temp file: ${currentAudioFile}`);
      fs.unlink(currentAudioFile, (err) => {
        if (err) console.error("Error removing temp file:", err);
      });
    }
  });

  try {
    // Generate unique filename
    const timestamp = Date.now();
    const outputFile = path.join(TEMP_DIR, `audio-${timestamp}.mp3`);

    console.log(`📥 Downloading to: ${outputFile}`);

    // Download audio file using youtube-dl-exec (same approach as the working project)
    await youtubeDl(video.url, {
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: 5, // Lower quality for faster downloads (0=best, 9=worst)
      output: outputFile,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        "referer:youtube.com",
        "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ],
    });

    console.log(`✅ Download completed: ${outputFile}`);

    // Verify file exists and has content
    if (!fs.existsSync(outputFile)) {
      throw new Error("Downloaded file does not exist");
    }

    const stats = fs.statSync(outputFile);
    if (stats.size === 0) {
      throw new Error("Downloaded file is empty");
    }

    console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Store reference for cleanup
    currentAudioFile = outputFile;

    // Create audio stream from downloaded file
    const audioStream = fs.createReadStream(outputFile);

    // Create audio resource from file stream
    const audioResource = createAudioResource(audioStream, {
      metadata: {
        title: video.title,
      },
      inlineVolume: true,
    });

    audioPlayer.play(audioResource);

    console.log(`✅ Now playing: ${video.title}`);
  } catch (error) {
    console.error("❌ Error downloading audio:", error);

    // Clean up file on error
    if (currentAudioFile && fs.existsSync(currentAudioFile)) {
      fs.unlink(currentAudioFile, (err) => {
        if (err) console.error("Error removing temp file on error:", err);
      });
    }

    // Fallback: try a simple test sound
    console.log("🔄 Falling back to test sound...");
    const { spawn } = require("child_process");
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=800:duration=2",
        "-f",
        "opus",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ],
      {
        stdio: ["ignore", "pipe", "ignore"],
      }
    );

    const resource = createAudioResource(ffmpeg.stdout);
    audioPlayer.play(resource);
    console.log(`🔊 Playing fallback sound for: ${video.title}`);
  }
}

function extractMusicQuery(text: string): string | null {
  // Remove "simon" and "musique" and get the rest
  const lowercaseText = text.toLowerCase();

  // Find "musique" and extract everything after it
  const musicIndex = lowercaseText.indexOf("musique");
  if (musicIndex === -1) {
    return null;
  }

  // Get text after "musique"
  let query = text.substring(musicIndex + "musique".length).trim();

  // Remove leading comma or other separators
  query = query.replace(/^[,\s]+/, "");

  return query || null;
}
