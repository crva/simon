import * as opus from "@discordjs/opus";
import { Transform } from "stream";
import { config } from "../config";
import { logger } from "../utils";

/**
 * Converts audio from 48kHz stereo to 16kHz mono format
 */
export function convertAudioFormat(pcmData: Buffer): Buffer {
  const stereoSamples = Math.floor(pcmData.length / 4);
  const monoSamples = Math.floor(stereoSamples / 3); // Downsample 48kHz → 16kHz
  const outputBuffer = Buffer.alloc(monoSamples * 2);

  for (let i = 0; i < monoSamples; i++) {
    const stereoIndex = i * 3;
    const byteIndex = stereoIndex * 4;

    if (byteIndex + 3 < pcmData.length) {
      let leftSample = pcmData.readInt16LE(byteIndex);
      let rightSample = pcmData.readInt16LE(byteIndex + 2);

      // Handle potential overflow
      if (leftSample > 32767) leftSample -= 65536;
      if (rightSample > 32767) rightSample -= 65536;

      // Convert stereo to mono and clamp
      const monoSample = Math.floor((leftSample + rightSample) / 2);
      const clampedSample = Math.max(-32768, Math.min(32767, monoSample));

      outputBuffer.writeInt16LE(clampedSample, i * 2);
    }
  }

  return outputBuffer;
}

/**
 * Creates a transform stream that converts Discord Opus audio to Vosk-compatible PCM format
 * Discord: Opus encoded → PCM 48kHz stereo 16-bit
 * Vosk: PCM 16kHz mono 16-bit
 */
export function createOpusToVoskTransform(): Transform {
  let audioBuffer = Buffer.alloc(0);
  const opusDecoder = new opus.OpusEncoder(48000, 2);

  return new Transform({
    transform(chunk: Buffer, encoding, callback) {
      try {
        // Decode Opus to PCM 48kHz stereo
        const decodedPCM = opusDecoder.decode(chunk);
        if (!decodedPCM || decodedPCM.length === 0) {
          callback();
          return;
        }

        // Convert PCM 48kHz stereo to 16kHz mono
        const convertedPCM = convertAudioFormat(decodedPCM);
        audioBuffer = Buffer.concat([audioBuffer, convertedPCM]);

        // Send chunks of appropriate size
        while (audioBuffer.length >= config.audio.chunkSize) {
          const chunkToSend = audioBuffer.slice(0, config.audio.chunkSize);
          audioBuffer = audioBuffer.slice(config.audio.chunkSize);
          this.push(chunkToSend);
        }

        callback();
      } catch (error) {
        logger.error({ error }, "Audio transform error");
        callback();
      }
    },

    flush(callback) {
      if (audioBuffer.length > 0) {
        this.push(audioBuffer);
      }
      callback();
    },
  });
}
