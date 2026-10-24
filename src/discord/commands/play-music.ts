import yts = require("yt-search");
import { logger } from "../../utils";
import { Track } from "./music-queue";

// "music" (English) can also come through, e.g. if Vosk mishears it that way
export const MUSIC_VARIANTS = ["musique", "music"];

type SearchCandidate = {
  query: string;
  video: yts.VideoSearchResult;
  score: number;
};

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Fraction of the query's words that actually appear in the candidate result,
// used to pick between the French and English transcriptions of a song title
// since whichever one is garbled will tend to share little with any result
function relevanceScore(query: string, candidate: string): number {
  const queryWords = normalizeWords(query);
  if (queryWords.length === 0) return 0;
  const candidateWords = new Set(normalizeWords(candidate));
  const matches = queryWords.filter((word) => candidateWords.has(word)).length;
  return matches / queryWords.length;
}

async function searchBestMatch(queries: string[]): Promise<SearchCandidate | null> {
  const uniqueQueries = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
  if (uniqueQueries.length === 0) return null;

  const candidates = await Promise.all(
    uniqueQueries.map(async (query): Promise<SearchCandidate | null> => {
      const results = await yts(query);
      const video = results.videos[0];
      if (!video) return null;
      return {
        query,
        video,
        score: relevanceScore(query, `${video.title} ${video.author.name}`),
      };
    })
  );

  const ranked = candidates.filter((c): c is SearchCandidate => c !== null);
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0] ?? null;
}

export async function resolveTrack(
  transcript: string,
  englishTranscript: string | null = null
): Promise<Track | null> {
  const frenchQuery = extractMusicQuery(transcript);
  const queries = [frenchQuery, englishTranscript].filter(
    (q): q is string => !!q
  );
  if (queries.length === 0) return null;

  logger.info(`🔍 Searching: ${queries.join(" | ")}`);

  const best = await searchBestMatch(queries);
  if (!best) {
    logger.warn("❌ No music found");
    return null;
  }
  const { video } = best;

  logger.info(
    `🎵 Found: ${video.title} by ${video.author.name} (matched query: "${best.query}")`
  );

  return { url: video.url, title: video.title };
}

function extractMusicQuery(text: string): string | null {
  const lowerText = text.toLowerCase();
  for (const variant of MUSIC_VARIANTS) {
    const musicIndex = lowerText.indexOf(variant);
    if (musicIndex !== -1) {
      return (
        text.substring(musicIndex + variant.length).replace(/^[,\s]+/, "") ||
        null
      );
    }
  }
  return null;
}
