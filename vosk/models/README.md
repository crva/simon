# Vosk Models

This directory contains speech recognition models for the Discord bot.

## Setup (example for French)

1. Download the French model:

   ```bash
   wget https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip
   unzip vosk-model-small-fr-0.22.zip
   ```

2. Update the model path in `.env`:
   ```
   VOSK_MODEL_PATH=./vosk/models/vosk-model-small-fr-0.22
   ```
