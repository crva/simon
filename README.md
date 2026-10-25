# simon

A Discord bot that listens to a voice channel, and when it hears its wake word, transcribes the request and acts on it — playing/queuing music, sending messages, or controlling playback.

⚠️ The wake word itself is French ("Simon"), but commands can be phrased however you'd naturally say them, in French or English — see [How it works](#how-it-works).

## Prerequisites

- Node.js 22+
- `ffmpeg` on PATH (used to transcode streamed audio)
- Linux or WSL (the native Vosk/Whisper bindings in `vosk/native`/`whisper/native` are built for `linux-x64` and `win-x64`; Windows native compilation of some dependencies is not supported — see `vosk/models/README.md` if you need another platform)
- Vosk model files (see `vosk/models/README.md`)
- A Whisper model file (see `whisper/models/README.md`)
- [Ollama](https://ollama.com) running a small instruction-tuned model, reachable from wherever the bot runs (see [Local LLM](#local-llm-ollama) below)
- A CUDA-capable GPU is strongly recommended for Whisper (a few seconds per command on CPU vs ~1-2s on GPU) — see `whisper/README.md` for the CPU-only fallback

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
| `SAMPLE_RATE` | no (default `16000`) | Vosk/Whisper sample rate |
| `CHUNK_SIZE` | no (default `4000`) | PCM chunk size (bytes) fed to Vosk |
| `MUSIC_CACHE_ENABLED` | no (default `false`) | Cache downloaded/streamed tracks to disk under `music/`, keyed by video ID |
| `MUSIC_NOTIFICATION_CHANNEL_ID` | no | Text channel ID where music/command embeds are posted. Leave empty to disable |
| `WHISPER_MODEL_PATH` | no (default `./whisper/models/ggml-small.bin`) | Path to the Whisper model file |
| `CUDA_LIB_PATH` | no (default `~/cuda-toolkit/lib64`) | Where to find `libcudart`/`libcublas` for GPU-accelerated Whisper. Irrelevant for a CPU-only build |
| `OLLAMA_MODEL` | no (default `hf.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q8_0`) | Model name as known to your Ollama instance |
| `OLLAMA_BASE_URL` | no | Override for the Ollama API URL. Left empty, the bot resolves WSL2's host gateway IP at runtime (works when Ollama runs on the Windows host) |
| `NODE_ENV` | no | `development` enables pretty console logs |
| `LOG_LEVEL` | no (default `info`) | pino log level |

## How it works

Speech recognition runs in two passes, trading off a cheap/fast model against an accurate/flexible one:

1. **Capture**: the bot joins the voice channel and subscribes to each speaker's audio individually (per-user, so multiple people talking at once are each transcribed, not just the first).
2. **Decode**: Discord's Opus audio is decoded to 48kHz stereo PCM, then downsampled to 16kHz mono (with basic anti-aliasing).
3. **Pre-filter (Vosk)**: a single French Vosk recognizer streams the audio live and produces a transcript when the speaker goes silent. Native calls run on a worker thread pool (via `koffi`) so decoding never blocks Discord's audio playback. This transcript is only used to cheaply decide whether the wake word ("simon", or a near-homophone Vosk commonly mishears it as: "c'est mon", "six mots", "ces mots", "si mon") is plausibly present *anywhere* in the utterance — not to parse the actual command. This keeps the expensive steps below from running on every unrelated thing said in the channel.
4. **Transcription (Whisper)**: if the pre-filter matches, the *entire* utterance's raw audio is re-transcribed by `whisper.cpp` (see `whisper/README.md`) — a single multilingual model, so French commands and English song titles are both handled accurately without needing a second recognizer or any FR/EN disambiguation logic.
5. **Command parsing (local LLM)**: the Whisper transcript is sent to a small instruction-tuned model running locally via Ollama (see [Local LLM](#local-llm-ollama)), which extracts the intended action as JSON — regardless of word order, verb choice, or where in the sentence the wake word falls. "simon mets *X*", "lance *X* simon", "*X* stp simon" all resolve to the same `play` command with the same query.
6. **Execution**: the bot acts on the parsed action — `play`, `skip`, `pause`, `resume`, `stop`, `message`, or `none` if nothing was recognized.

## Voice commands

Say the wake word anywhere in the sentence — before, after, or in the middle of the request. Phrasing is flexible since it's parsed by an LLM, not matched against a fixed keyword list; these are just illustrative:

| Say (examples) | Effect |
|---|---|
| "simon mets *du eminem*", "lance *bohemian rhapsody* simon", "*X* simon stp" | Plays the track if nothing is playing, otherwise queues it |
| "simon tu peux skip", "simon passe à la suivante" | Skips to the next queued track |
| "simon mets en pause" | Pauses playback |
| "simon reprends" | Resumes playback |
| "simon stop", "simon on arrête tout" | Stops playback and clears the queue |
| "simon envoie *message* dans *#channel*" | Sends a text message to that channel |

Music is streamed directly (no full download before playing); with `MUSIC_CACHE_ENABLED=true`, each track is also saved to `music/` so repeat requests skip straight to the cached file.

The actual prompt (with the full set of few-shot examples used to keep the small model reliable) lives in `src/llm/command-prompt.ts` — tune it there if a particular phrasing keeps getting misread.

## Local LLM (Ollama)

1. Install [Ollama](https://ollama.com) and pull a small instruction-tuned model, e.g.:
   ```bash
   ollama pull hf.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q8_0
   ```
2. If Ollama runs on Windows while the bot runs in WSL2, Ollama needs to listen on more than just `127.0.0.1` for WSL to reach it:
   - Set the `OLLAMA_HOST` environment variable to `0.0.0.0:11434` (persistent user env var on Windows), then restart Ollama.
   - The bot resolves WSL2's NAT gateway IP at runtime (`ip route`) to reach it — no config needed in the common case. Set `OLLAMA_BASE_URL` to override (e.g. if using WSL2 mirrored networking mode, where plain `http://localhost:11434` works instead).
3. Set `OLLAMA_MODEL` in `.env` if you're not using the default.

Bigger models (the repo's own testing also used `qwen2.5:7b`) are more reliable at generalizing to verbs/phrasings not covered by the prompt's examples, at the cost of some latency.

## Notifications

If `MUSIC_NOTIFICATION_CHANNEL_ID` is set, the bot posts an embed to that channel for each music event:

- **`play`**: a "Now Playing" or "Added Track" embed with the track's title/thumbnail/link, requester, and (if queued) the estimated wait time and position in queue.
- **`skip` / `pause` / `resume` / `stop`**: a short confirmation embed naming the action and the affected track, e.g. "⏭️ Skipped [Title by Author](url)".
