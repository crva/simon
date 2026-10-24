import { AudioResource, createAudioResource, StreamType } from "@discordjs/voice";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import youtubeDl from "youtube-dl-exec";
import { config } from "../config";
import { logger } from "../utils";

const MUSIC_DIR = path.join(__dirname, "../../music");
const YT_DLP_PATH: string = (youtubeDl as unknown as {
  constants: { YOUTUBE_DL_PATH: string };
}).constants.YOUTUBE_DL_PATH;

if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

// Cache key derived from the video, not the title, so the same video always
// maps to the same file and repeat requests skip streaming entirely
function getCacheKey(videoUrl: string): string {
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1);
    }
    const id = url.searchParams.get("v");
    if (id) return id;
  } catch {
    // fall through to hash-based key below
  }
  return crypto.createHash("sha1").update(videoUrl).digest("hex").slice(0, 16);
}

let currentProcess: ChildProcessWithoutNullStreams | null = null;

// Kills whatever yt-dlp process is still streaming the previous track, so
// skipping/stopping doesn't leave it running in the background for nothing
export function stopCurrentStream(): void {
  if (currentProcess && !currentProcess.killed) {
    currentProcess.kill("SIGKILL");
  }
  currentProcess = null;
}

export function streamMusic(videoUrl: string, title: string): AudioResource {
  stopCurrentStream();

  const cachePath = path.join(MUSIC_DIR, `${getCacheKey(videoUrl)}.audio`);

  if (
    config.music.cacheEnabled &&
    fs.existsSync(cachePath) &&
    fs.statSync(cachePath).size > 0
  ) {
    logger.info(`📀 Playing from cache: ${title}`);
    return createAudioResource(fs.createReadStream(cachePath), {
      inputType: StreamType.Arbitrary,
      metadata: { title },
      inlineVolume: true,
    });
  }

  logger.info(`📡 Streaming: ${title}`);
  const tmpPath = `${cachePath}.part`;

  const child = spawn(YT_DLP_PATH, [
    "-f",
    "bestaudio",
    "-o",
    "-",
    "--no-playlist",
    "--no-warnings",
    "--no-check-certificates",
    "--prefer-free-formats",
    "--add-header",
    "referer:youtube.com",
    "--add-header",
    "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    videoUrl,
  ]);
  currentProcess = child;

  child.on("error", (error) => {
    logger.error({ error }, "❌ yt-dlp spawn error");
  });

  if (config.music.cacheEnabled) {
    // Write the stream to disk in parallel so next time this track is
    // requested, playback can start from the cached file instead
    const cacheWrite = fs.createWriteStream(tmpPath);
    child.stdout.pipe(cacheWrite);

    child.on("close", (code) => {
      if (code === 0) {
        fs.rename(tmpPath, cachePath, (error) => {
          if (error) logger.error({ error }, "❌ Failed to finalize music cache");
        });
      } else {
        fs.unlink(tmpPath, () => {});
      }
    });
  }

  child.on("close", () => {
    if (currentProcess === child) {
      currentProcess = null;
    }
  });

  return createAudioResource(child.stdout, {
    inputType: StreamType.Arbitrary,
    metadata: { title },
    inlineVolume: true,
  });
}
