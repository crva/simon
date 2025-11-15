import { AudioPlayer } from "@discordjs/voice";
import { Guild } from "discord.js";
import yts from "yt-search";
import { cleanupFile, createMusicResource, downloadMusic } from "../../audio";

let currentMusicFile: string | null = null;

export async function playMusic(
  guild: Guild,
  transcript: string,
  audioPlayer: AudioPlayer
): Promise<void> {
  const searchQuery = extractMusicQuery(transcript);
  if (!searchQuery) return;

  console.log(`🔍 Searching: "${searchQuery}"`);

  const searchResults = await yts(searchQuery);
  const video = searchResults.videos[0];
  if (!video) {
    console.log("❌ No music found");
    return;
  }

  console.log(`🎵 Found: "${video.title}" by ${video.author.name}`);

  try {
    setupCleanup(audioPlayer);

    console.log(`📥 Downloading...`);
    const download = await downloadMusic(video.url, video.title);
    console.log(`✅ Downloaded: ${download.size} MB`);

    currentMusicFile = download.path;
    const resource = createMusicResource(download.path, video.title);

    audioPlayer.play(resource);
    console.log(`🎵 Playing: ${video.title}`);
  } catch (error) {
    console.error("❌ Playback failed:", error);
  }
}

function setupCleanup(audioPlayer: AudioPlayer) {
  audioPlayer.on("stateChange", (oldState, newState) => {
    if (newState.status === "idle" && currentMusicFile) {
      cleanupFile(currentMusicFile);
      currentMusicFile = null;
    }
  });
}

function extractMusicQuery(text: string): string | null {
  const musicIndex = text.toLowerCase().indexOf("musique");
  if (musicIndex === -1) return null;

  return text.substring(musicIndex + 7).replace(/^[,\s]+/, "") || null;
}
