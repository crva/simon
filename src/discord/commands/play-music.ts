import yts = require("yt-search");
import { logger } from "../../utils";
import { Track } from "./music-queue";

export async function resolveTrack(query: string): Promise<Track | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  logger.info(`🔍 Searching: ${trimmed}`);

  const results = await yts(trimmed);
  const video = results.videos[0];
  if (!video) {
    logger.warn("❌ No music found");
    return null;
  }

  logger.info(`🎵 Found: ${video.title} by ${video.author.name}`);

  return {
    url: video.url,
    title: video.title,
    ...(video.thumbnail ? { thumbnail: video.thumbnail } : {}),
    author: video.author.name,
    duration: video.timestamp,
  };
}
