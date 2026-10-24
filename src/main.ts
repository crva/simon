import { DiscordBot } from "./discord";
import { logger } from "./utils";
import { VoskManager } from "./vosk";

async function main(): Promise<void> {
  let voskManager: VoskManager | undefined;
  let discordBot: DiscordBot | undefined;

  const shutdown = async (exitCode: number): Promise<void> => {
    try {
      if (discordBot) {
        await discordBot.stop();
      }
      if (voskManager) {
        voskManager.destroy();
      }
      logger.info("✅ Cleanup completed");
    } catch (error) {
      logger.error({ error }, "❌ Error during shutdown");
    } finally {
      process.exit(exitCode);
    }
  };

  // Without these, a native crash or a stray unhandled rejection kills the
  // process without freeing the Vosk models or killing the yt-dlp subprocess
  process.on("uncaughtException", (error) => {
    logger.error({ error }, "❌ Uncaught exception");
    void shutdown(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ error: reason }, "❌ Unhandled promise rejection");
    void shutdown(1);
  });

  try {
    voskManager = new VoskManager();
    discordBot = new DiscordBot(voskManager);
    await discordBot.start();

    process.on("SIGINT", () => {
      logger.info("🔄 Graceful shutdown initiated...");
      void shutdown(0);
    });
  } catch (error) {
    logger.error({ error }, "❌ Failed to start application");
    await shutdown(1);
  }
}

main().catch((error) => {
  logger.error({ error }, "❌ Unhandled error");
  process.exit(1);
});
