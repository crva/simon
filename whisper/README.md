# Whisper Native Binary

Speech recognition runs in two passes. Vosk (`../vosk/`) streams live and acts as a cheap wake-word pre-filter. Once an utterance plausibly contains the wake word, the full utterance is re-transcribed here with `whisper.cpp` for much better accuracy — especially on slang, invented song titles, and French/English code-switching (one multilingual model handles both natively, instead of running two separate recognizers and scoring which one is less garbled).

`native/linux-x64/` needs a `whisper-cli` binary (CUDA-accelerated) plus its own small `ggml`/`whisper` shared libraries — **you build these yourself** (see below), they aren't vendored in git. Unlike `vosk/native/`, this binary is linked against your own CUDA toolkit version, GPU architecture, and glibc, so a copy built on one machine generally won't run on another — there's nothing portable to commit. The actual CUDA runtime libraries (`libcudart`, `libcublas`, `libcublasLt`) are **also not vendored** — `libcublasLt` alone is close to 500MB. They're expected to already be present on the machine running the bot, via the CUDA toolkit installed as described below. `CUDA_LIB_PATH` in `.env` points at them if they're not at the default `~/cuda-toolkit/lib64`.

Using [Docker](../README.md#docker) instead? None of this applies — the image builds its own copy of `whisper.cpp` from source every time, matched to the image's own CUDA toolkit, so there's nothing to build or vendor on your end.

Without a GPU/CUDA toolkit, drop `CUDA_LIB_PATH` and rebuild as CPU-only (see step 3) — same code path, just slower (a few seconds per command instead of ~1-2s).

## Building

### 1. Build tools

`cmake`, a C++ compiler, `git`. If `cmake` isn't available system-wide and you can't install it with `apt`, NVIDIA's own portable build (below) works too, or grab a portable one directly:

```bash
wget https://github.com/Kitware/CMake/releases/download/v4.4.4/cmake-4.4.4-linux-x86_64.tar.gz
tar xzf cmake-4.4.4-linux-x86_64.tar.gz
export PATH="$PWD/cmake-4.4.4-linux-x86_64/bin:$PATH"
```

### 2. CUDA toolkit (skip for a CPU-only build)

The GPU driver on WSL2 is provided by Windows — only the CUDA toolkit itself (`nvcc`, `libcublas`, etc.) needs installing inside WSL. NVIDIA's apt repo for WSL currently fails signature verification on Debian trixie (its key is still SHA1-signed, which trixie's stricter policy now rejects) — the reliable path is the official `.run` installer, which can install without root into a custom directory:

```bash
wget https://developer.download.nvidia.com/compute/cuda/13.3.1/local_installers/cuda_13.3.1_610.43.02_linux.run
chmod +x cuda_13.3.1_610.43.02_linux.run
mkdir -p ~/cuda-install-tmp
./cuda_13.3.1_610.43.02_linux.run --silent --toolkit --toolkitpath=$HOME/cuda-toolkit --override --no-opengl-libs --tmpdir=$HOME/cuda-install-tmp
```

`--tmpdir` matters: the installer's default `/tmp` is often a small tmpfs on WSL and fails with "Extraction failed" otherwise. Run the whole thing (download included) from somewhere on the real disk, not `/tmp` — same tmpfs issue applies to the ~4GB download itself.

### 3. Build whisper.cpp

```bash
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
export PATH=$HOME/cuda-toolkit/bin:$PATH
export LD_LIBRARY_PATH=$HOME/cuda-toolkit/lib64:$LD_LIBRARY_PATH

cmake -B build -DCMAKE_BUILD_TYPE=Release \
  -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86 -DCUDAToolkit_ROOT=$HOME/cuda-toolkit

cmake --build build -j$(nproc) --target whisper-cli
```

`CMAKE_CUDA_ARCHITECTURES=86` targets Ampere (RTX 30xx). Adjust for your GPU: `89` for RTX 40xx, `75` for RTX 20xx/GTX 16xx, `90` for H100.

Both `-DCUDAToolkit_ROOT` at configure time and `LD_LIBRARY_PATH` at build time are required — without either, the linker silently resolves to the wrong (or no) CUDA lib directory and fails with "undefined reference" errors on `cudart`/`cublas` symbols despite CMake reporting the toolkit as found.

For a CPU-only build, drop the whole CUDA step and just omit `-DGGML_CUDA=ON` and the two CUDA env vars above.

### 4. Vendor the result

```bash
cp build/bin/whisper-cli build/bin/*.so* <this-repo>/whisper/native/linux-x64/
```
