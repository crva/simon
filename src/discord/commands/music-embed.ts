import { EmbedBuilder, Guild } from "discord.js";
import { config } from "../../config";
import { logger } from "../../utils";
import { Track } from "./music-queue";

export function parseDuration(timestamp: string): number {
  const parts = timestamp.split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm.padStart(2, "0")}:${ss}` : `${mm.padStart(2, "0")}:${ss}`;
}

function ordinal(position: number): string {
  if (position === 1) return "Next";
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  switch (position % 10) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}

export async function sendMusicEmbed(
  guild: Guild,
  track: Track,
  status: "playing" | "queued",
  options: { upcomingPosition?: number; estimatedWaitSeconds?: number } = {}
): Promise<void> {
  if (!config.music.notificationChannelId) return;

  try {
    const channel = guild.channels.cache.get(config.music.notificationChannelId);
    if (!channel?.isTextBased()) {
      logger.warn("⚠️ Music notification channel not found or not text-based");
      return;
    }

    const linkText = track.author ? `${track.title} by ${track.author}` : track.title;

    const embed = new EmbedBuilder()
      .setAuthor({ name: status === "playing" ? "▶️ Now Playing" : "➕ Added Track" })
      .setColor(status === "playing" ? 0x1db954 : 0x5865f2)
      .addFields({ name: "Track", value: `[${linkText}](${track.url})` });

    if (track.thumbnail) {
      embed.setThumbnail(track.thumbnail);
    }

    if (status === "queued") {
      const waitLabel =
        options.estimatedWaitSeconds !== undefined
          ? formatDuration(options.estimatedWaitSeconds)
          : "Unknown";
      // Discord packs up to 3 inline fields per row; an inline (not
      // full-width) blank spacer fills the 3rd column so each pair stays on
      // its own row without leaving an empty row in between
      embed.addFields(
        { name: "Estimated time until played", value: waitLabel, inline: true },
        { name: "Track Length", value: track.duration ?? "Unknown", inline: true },
        { name: "​", value: "​", inline: true },
        {
          name: "Position in upcoming",
          value: options.upcomingPosition !== undefined ? ordinal(options.upcomingPosition) : "Next",
          inline: true,
        },
        {
          name: "Position in queue",
          value: String((options.upcomingPosition ?? 1) + 1),
          inline: true,
        },
        { name: "​", value: "​", inline: true }
      );
    } else {
      embed.addFields({
        name: "Track Length",
        value: track.duration ?? "Unknown",
        inline: true,
      });
    }

    if (track.requestedBy) {
      try {
        const member =
          guild.members.cache.get(track.requestedBy) ??
          (await guild.members.fetch(track.requestedBy));
        embed.setFooter({
          text: `Requested by ${member.displayName}`,
          iconURL: member.displayAvatarURL(),
        });
      } catch {
        embed.setFooter({ text: "Requested by unknown user" });
      }
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error({ error }, "❌ Failed to send music embed");
  }
}
