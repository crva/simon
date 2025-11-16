import { createAudioResource } from "@discordjs/voice";
import * as fs from "fs";
import * as path from "path";
import youtubeDl from "youtube-dl-exec";

const MUSIC_DIR = path.join(__dirname, "../../music");

if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

export async function downloadMusic(videoUrl: string, title: string) {
  const sanitizedTitle = title.replace(/[^\w\s-]/g, "").substring(0, 50);
  const timestamp = Date.now();
  const filename = `${sanitizedTitle}-${timestamp}.mp3`;
  const outputPath = path.join(MUSIC_DIR, filename);

  await youtubeDl(videoUrl, {
    extractAudio: true,
    audioFormat: "mp3",
    audioQuality: 5,
    output: outputPath,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: [
      "referer:youtube.com",
      "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    ],
  });

  const stats = fs.statSync(outputPath);
  if (!fs.existsSync(outputPath) || stats.size === 0) {
    throw new Error("Download failed");
  }

  return {
    path: outputPath,
    size: (stats.size / 1024 / 1024).toFixed(2),
  };
}

export function createMusicResource(filePath: string, title: string) {
  const audioStream = fs.createReadStream(filePath);
  return createAudioResource(audioStream, {
    metadata: { title },
    inlineVolume: true,
  });
}

export function cleanupFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error("Cleanup error:", err);
    });
  }
}

export function cleanupAllMusic() {
  if (!fs.existsSync(MUSIC_DIR)) {
    return;
  }

  const files = fs.readdirSync(MUSIC_DIR);
  const musicFiles = files.filter((file) => file.endsWith(".mp3"));

  console.log(`🗑️ Cleaning up ${musicFiles.length} music files...`);

  musicFiles.forEach((file) => {
    const filePath = path.join(MUSIC_DIR, file);
    cleanupFile(filePath);
  });
}
