# Whisper Models

This directory holds the Whisper model used to re-transcribe full utterances once Vosk's cheap streaming pass (see `../../vosk/`) flags one as plausibly containing the wake word. A single multilingual model handles French/English code-switching natively, which is why there's no separate English model here (unlike Vosk).

## Setup

Download the multilingual `small` model and place it here as `ggml-small.bin`:

```bash
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

Then point `WHISPER_MODEL_PATH` in `.env` at it (defaults to `./whisper/models/ggml-small.bin`, so no `.env` change needed if you keep the default path).

Bigger models (`medium`, `large-v3-turbo`) are more accurate but slower — see the full list at https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md. `small` was chosen as a reasonable accuracy/speed tradeoff, especially once running on GPU (see `../README.md`).
