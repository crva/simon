# Vosk Models

This directory holds the French Vosk model. Vosk only runs as a cheap, real-time pre-filter now (is the wake word plausibly in there?) — the actual transcription used for commands comes from Whisper (see `../../whisper/`), so there's no separate English model to download here anymore.

## Setup

1. Download and extract the French model:

   ```bash
   wget https://alphacephei.com/vosk/models/vosk-model-fr-0.6-linto-2.2.0.zip
   # or: vosk-model-fr-0.22.zip (same size, no speed guarantee) / vosk-model-small-fr-0.22.zip (~40MB, low accuracy)
   ```

   Extract it here (`unzip <file>.zip`, or `python3 -m zipfile -e <file>.zip .` if `unzip` isn't installed).

2. Set the path in `.env`:

   ```
   VOSK_MODEL_PATH=./vosk/models/vosk-model-fr-0.6-linto-2.2.0
   ```

Full model list: https://alphacephei.com/vosk/models

## Note on the native binding

This project does **not** use the `vosk` npm package (it depends on `ffi-napi`, which is unmaintained and fails to build on current Node/toolchains). Instead, `src/vosk/vosk-native.ts` calls Vosk's C API directly via `koffi`, using the prebuilt shared libraries vendored in `../native/` (`linux-x64/libvosk.so`, `win-x64/libvosk.dll`). No compilation step is needed for Vosk itself — only the model files above.
