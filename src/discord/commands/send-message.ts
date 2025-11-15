import { Guild, TextChannel } from "discord.js";

export async function sendMessage(
  guild: Guild,
  transcript: string,
  speakFn?: (text: string) => Promise<void>
): Promise<void> {
  try {
    // Extract message content (between quotes or after "message")
    let messageContent = extractMessageContent(transcript);

    if (!messageContent) {
      console.log("❌ No message content found");
      return;
    }

    // Extract channel name or default to "general"
    let channelName = extractChannelName(transcript) || "general";

    // Find the target channel
    const targetChannel = findTextChannel(guild, channelName);

    if (!targetChannel) {
      console.log(`❌ Channel "${channelName}" not found`);
      return;
    }

    // Send the message
    await targetChannel.send(messageContent);
    console.log(
      `✅ Message sent to #${targetChannel.name}: "${messageContent}"`
    );

    if (speakFn) {
      await speakFn("c'est fait");
    }
  } catch (error) {
    console.error(`❌ Failed to send message: ${error}`);
  }
}

function extractMessageContent(text: string): string | null {
  // Try quoted content first
  const quotedMatch = text.match(/"([^"]*)"/);
  if (quotedMatch && quotedMatch[1]) {
    return quotedMatch[1].trim();
  }

  // Try after keywords
  const keywords = ["message", "écris", "dis", "envoie"];
  for (const keyword of keywords) {
    const regex = new RegExp(`${keyword}\\s+(.+?)\\s+(?:dans|sur)`, "i");
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: everything after keyword
  for (const keyword of keywords) {
    const regex = new RegExp(`${keyword}\\s+(.+)`, "i");
    const match = text.match(regex);
    if (match && match[1]) {
      // Remove channel reference at the end
      return match[1].replace(/\s+(?:dans|sur)\s+\w+\s*$/i, "").trim();
    }
  }

  return null;
}

function extractChannelName(text: string): string | null {
  const channelKeywords = ["salon", "channel", "dans le", "dans", "sur"];

  for (const keyword of channelKeywords) {
    const regex = new RegExp(`${keyword}\\s+(\\w+)`, "i");
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function findTextChannel(
  guild: Guild,
  channelName: string
): TextChannel | null {
  const channel = guild.channels.cache.find(
    (ch) =>
      ch.isTextBased() &&
      ch.name.toLowerCase().includes(channelName.toLowerCase()) &&
      ch.type === 0 // GUILD_TEXT
  ) as TextChannel;

  return channel || null;
}
