import * as vosk from "./vosk-native";
import { config } from "../config";
import { logger } from "../utils";

export class VoskManager {
  private model: vosk.Model;

  constructor() {
    try {
      vosk.setLogLevel(-1);
      this.model = new vosk.Model(config.vosk.modelPath);
      logger.info("✅ Vosk model loaded successfully");
    } catch (error) {
      logger.error({ error }, "❌ Failed to load Vosk model");
      throw error;
    }
  }

  /**
   * Creates a new speech recognizer instance
   */
  createRecognizer(): vosk.Recognizer {
    return new vosk.Recognizer({
      model: this.model,
      sampleRate: config.vosk.sampleRate,
    });
  }

  /**
   * Processes audio chunk and returns recognition result
   */
  async processAudioChunk(
    recognizer: vosk.Recognizer,
    audioChunk: Buffer
  ): Promise<string | null> {
    try {
      if (await recognizer.acceptWaveform(audioChunk)) {
        const result = await recognizer.result();
        const parsedResult = JSON.parse(result);
        return parsedResult.text?.trim() || null;
      }
      return null;
    } catch (error) {
      logger.error({ error }, "❌ Audio processing error");
      return null;
    }
  }

  /**
   * Gets the current (continuously updating) partial hypothesis, even
   * mid-utterance before any silence/segment boundary is reached
   */
  async getLivePartial(recognizer: vosk.Recognizer): Promise<string | null> {
    try {
      const partial = JSON.parse(await recognizer.partialResult());
      return partial.partial?.trim() || null;
    } catch (error) {
      logger.error({ error }, "❌ Partial result error");
      return null;
    }
  }

  /**
   * Gets final recognition result
   */
  async getFinalResult(recognizer: vosk.Recognizer): Promise<string | null> {
    try {
      const finalResult = JSON.parse(await recognizer.finalResult());
      return finalResult.text?.trim() || null;
    } catch (error) {
      logger.error({ error }, "❌ Final result error");
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.model.free();
  }
}
