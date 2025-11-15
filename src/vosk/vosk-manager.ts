import * as vosk from "vosk";
import { config } from "../config";

export class VoskManager {
  private model: vosk.Model;

  constructor() {
    try {
      vosk.setLogLevel(-1);
      this.model = new vosk.Model(config.vosk.modelPath);
      console.log("✅ Vosk model loaded successfully");
    } catch (error) {
      console.error("❌ Failed to load Vosk model:", error);
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
  processAudioChunk(
    recognizer: vosk.Recognizer,
    audioChunk: Buffer
  ): string | null {
    try {
      if (recognizer.acceptWaveform(audioChunk)) {
        const result = recognizer.result();
        const parsedResult = JSON.parse(result);
        return parsedResult.text?.trim() || null;
      }
      return null;
    } catch (error) {
      console.error("Audio processing error:", error);
      return null;
    }
  }

  /**
   * Gets final recognition result
   */
  getFinalResult(recognizer: vosk.Recognizer): string | null {
    try {
      const finalResult = recognizer.finalResult();
      return finalResult.text?.trim() || null;
    } catch (error) {
      console.error("Final result error:", error);
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
