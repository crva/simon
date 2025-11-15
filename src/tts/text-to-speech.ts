import * as fs from "fs";
import * as path from "path";
// @ts-ignore - pas de types disponibles pour gtts
const gtts = require("gtts");

export class TextToSpeech {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(__dirname, "../../temp");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Génère un fichier audio à partir d'un texte
   */
  async generateSpeech(text: string, language: string = "fr"): Promise<string> {
    return new Promise((resolve, reject) => {
      const filename = `speech_${Date.now()}.mp3`;
      const filepath = path.join(this.tempDir, filename);

      const tts = new gtts(text, language);
      
      tts.save(filepath, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(filepath);
        }
      });
    });
  }

  /**
   * Nettoie les fichiers temporaires
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        for (const file of files) {
          if (file.endsWith(".mp3")) {
            fs.unlinkSync(path.join(this.tempDir, file));
          }
        }
      }
    } catch (error) {
      console.error("Error cleaning up TTS files:", error);
    }
  }
}