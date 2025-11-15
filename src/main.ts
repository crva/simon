import { DiscordBot } from "./discord";
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
      console.log("\n🔄 Graceful shutdown initiated...");

      try {
        if (discordBot) {
          await discordBot.stop();
        }
        if (voskManager) {
          voskManager.destroy();
        }
        console.log("✅ Cleanup completed");
        process.exit(0);
      } catch (error) {
        console.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error("❌ Failed to start application:", error);

    // Cleanup if initialization failed
    if (voskManager) {
      voskManager.destroy();
    }

    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
