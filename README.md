# simon

A Discord bot that provides real-time voice transcription using Vosk speech recognition.

## Prerequisites

- Node.js (v16 or higher)
- A Discord Bot Token
- Vosk model files

## How it Works

1. **Audio Capture**: Bot joins Discord voice channel and listens for user speech
2. **Opus Decoding**: Converts Discord's Opus-encoded audio to PCM format
3. **Format Conversion**: Downsamples from 48kHz stereo to 16kHz mono
4. **Speech Recognition**: Uses Vosk to transcribe audio to text
5. **Output**: Displays transcription results in console
