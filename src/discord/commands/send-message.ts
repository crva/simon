import { Guild, TextChannel } from "discord.js";
import { logger } from "../../utils";

const DEFAULT_CHANNEL_NAME = "general";

export async function sendMessage(
  guild: Guild,
  content: string,
  channelName: string | null
): Promise<void> {
  try {
    if (!content.trim()) {
      logger.warn("❌ No message content found");
      return;
    }

    const targetChannel = findTextChannel(guild, channelName || DEFAULT_CHANNEL_NAME);
    if (!targetChannel) {
      logger.warn(`❌ Channel ${channelName || DEFAULT_CHANNEL_NAME} not found`);
      return;
    }

    await targetChannel.send(content);
    logger.info(`✅ Message sent to #${targetChannel.name}: ${content}`);
  } catch (error) {
    logger.error({ error }, "❌ Failed to send message");
  }
}

function findTextChannel(guild: Guild, channelName: string): TextChannel | null {
  const channel = guild.channels.cache.find(
    (ch) =>
      ch.isTextBased() &&
      ch.name.toLowerCase().includes(channelName.toLowerCase()) &&
      ch.type === 0 // GUILD_TEXT
  ) as TextChannel;

  return channel || null;
}
