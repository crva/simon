import { DiscordBot } from "./discord";
import { logger } from "./utils";
import { VoskManager } from "./vosk";

async function main(): Promise<void> {
  let voskManager: VoskManager | undefined;
  let discordBot: DiscordBot | undefined;

  try {
    // Initialize Vosk
    voskManager = new VoskManager();

    // Initialize Discord bot
    discordBot = new DiscordBot(voskManager);

    // Start the bot
    await discordBot.start();

    // Graceful shutdown handling
    process.on("SIGINT", async () => {
      logger.info("\n🔄 Graceful shutdown initiated...");

      try {
        if (discordBot) {
          await discordBot.stop();
        }
        if (voskManager) {
          voskManager.destroy();
        }
        logger.info("✅ Cleanup completed");
        process.exit(0);
      } catch (error) {
        logger.error({ error }, "❌ Error during shutdown");
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error({ error }, "❌ Failed to start application");

    // Cleanup if initialization failed
    if (voskManager) {
      voskManager.destroy();
    }

    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  logger.error({ error }, "❌ Unhandled error");
  process.exit(1);
});
