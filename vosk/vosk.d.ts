declare module 'vosk' {
  export function setLogLevel(level: number): void;
  
  export class Model {
    constructor(path: string);
    free(): void;
  }
  
  export class Recognizer {
    constructor(options: { model: Model; sampleRate: number });
    acceptWaveform(chunk: Buffer): boolean;
    finalResult(): { text: string };
    free(): void;
  }
}