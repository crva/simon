# simon

A Discord bot that listens to a voice channel and transcribes speech in real time using Vosk, then acts on voice commands.

⚠️ French only for commands/wake word. Song titles can be in English or French (see below).

## Prerequisites

- Node.js 22+
- `ffmpeg` on PATH (used to transcode streamed audio)
- Linux or WSL (the native Vosk bindings in `vosk/native` are built for `linux-x64` and `win-x64`; Windows native compilation of some dependencies is not supported — see `vosk/README.md` if you need another platform)
- Vosk model files (see `vosk/models/README.md`)

## Setup

1. `npm install`
2. Copy `.env.blank` to `.env` and fill in the values (see below)
3. `npm run build` then `npm start`, or `npm run dev` for pretty/verbose logs

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | yes | Bot token |
| `DISCORD_SERVER_ID` | yes | Guild ID the bot joins |
| `DISCORD_SERVER_CHANNEL_ID` | yes | Voice channel ID the bot joins |
| `VOSK_MODEL_PATH` | yes | Path to the French Vosk model directory |
| `VOSK_MODEL_PATH_EN` | yes | Path to the English Vosk model directory (used for song titles) |
| `SAMPLE_RATE` | no (default `16000`) | Vosk sample rate |
| `CHUNK_SIZE` | no (default `4000`) | PCM chunk size (bytes) fed to Vosk |
| `MUSIC_CACHE_ENABLED` | no (default `false`) | Cache downloaded/streamed tracks to disk under `music/`, keyed by video ID |
| `NODE_ENV` | no | `development` enables pretty console logs |
| `LOG_LEVEL` | no (default `info`) | pino log level |

## How it works

1. **Capture**: the bot joins the voice channel and subscribes to each speaker's audio individually (per-user, so multiple people talking at once are each transcribed, not just the first).
2. **Decode**: Discord's Opus audio is decoded to 48kHz stereo PCM, then downsampled to 16kHz mono (with basic anti-aliasing) for Vosk.
3. **Transcription**: two Vosk recognizers run in parallel per utterance — a French one (primary) and a small English one. Native calls run on a worker thread pool (via `koffi`) so decoding never blocks Discord's audio playback. Vosk's own C API is called directly (no bundled `vosk`/`ffi-napi` npm package — see `vosk/README.md`).
4. **Wake word**: a transcript is only acted on if it starts with "simon" (or a near-homophone Vosk commonly mishears it as: "c'est mon", "six mots", "ces mots", "si mon").
5. **Commands**: the transcript is matched against the list below.

## Voice commands

Say the wake word first, e.g. `"simon, musique, one more time daft punk"`.

| Say | Effect |
|---|---|
| `envoie "<message>" dans #<channel>` | Sends a text message to that channel |
| `musique <title>` | Plays the track if nothing is playing, otherwise queues it. Song titles are searched on YouTube using both the French and English transcriptions, picking whichever best matches the result found |
| `skip` (or "skype", a common mis-hearing) | Skips to the next queued track |
| `pause` (or "pose") | Pauses playback |
| `reprise` / `reprend` / `continue` / `resume` | Resumes playback |
| `stop` | Stops playback and clears the queue |

Music is streamed directly (no full download before playing); with `MUSIC_CACHE_ENABLED=true`, each track is also saved to `music/` so repeat requests skip straight to the cached file.

This is pattern matching on keywords, not an LLM — phrasing matters.
