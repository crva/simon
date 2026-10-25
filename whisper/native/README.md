# Whisper Native Binary

This directory needs `whisper-cli` plus its `ggml`/`whisper` shared libraries, under `linux-x64/` (or `win-x64/`), before the bot can run outside Docker.

**Unlike `vosk/native/`, this isn't vendored in git.** The binary here is linked against the specific CUDA toolkit version, GPU architecture, and glibc of whoever built it — it won't run on a different machine. There's no portable version to download; you build it yourself, once, for your own setup. See `../README.md` for the full build steps (CPU-only or CUDA, any platform/GPU).

Skip this entirely if you're using [Docker](../../README.md#docker) — it builds its own copy inside the image, matched to the image's own CUDA toolkit, every time.
