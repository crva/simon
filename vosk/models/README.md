# Vosk Models

This directory holds the speech recognition models. The bot needs two: French (primary) and English (used to re-read song titles, since the French model mangles English words).

## Setup

1. Download and extract both models:

   ```bash
   # French (pick one; the full model is far more accurate but ~1.5GB and slower to load)
   wget https://alphacephei.com/vosk/models/vosk-model-fr-0.6-linto-2.2.0.zip
   # or: vosk-model-fr-0.22.zip (same size, no speed guarantee) / vosk-model-small-fr-0.22.zip (~40MB, low accuracy)

   # English (small is enough, it's only used for song titles)
   wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
   ```

   Extract each zip here (`unzip <file>.zip`, or `python3 -m zipfile -e <file>.zip .` if `unzip` isn't installed).

2. Set both paths in `.env`:

   ```
   VOSK_MODEL_PATH=./vosk/models/vosk-model-fr-0.6-linto-2.2.0
   VOSK_MODEL_PATH_EN=./vosk/models/vosk-model-small-en-us-0.15
   ```

Full model list: https://alphacephei.com/vosk/models

## Note on the native binding

This project does **not** use the `vosk` npm package (it depends on `ffi-napi`, which is unmaintained and fails to build on current Node/toolchains). Instead, `src/vosk/vosk-native.ts` calls Vosk's C API directly via `koffi`, using the prebuilt shared libraries vendored in `../native/` (`linux-x64/libvosk.so`, `win-x64/libvosk.dll`). No compilation step is needed for Vosk itself — only the model files above.
