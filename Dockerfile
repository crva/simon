# syntax=docker/dockerfile:1

ARG CUDA_IMAGE_TAG=12.6.2
ARG CUDA_ARCH=86

# ---- whisper.cpp, built fresh against this image's own CUDA toolkit ----
# (not the vendored host binary in whisper/native/ — that one is linked
# against whatever CUDA version happens to be installed on the host, which
# won't match this image's runtime libs)
FROM nvidia/cuda:${CUDA_IMAGE_TAG}-devel-ubuntu24.04 AS whisper-builder
ARG CUDA_ARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
      git cmake build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git /whisper.cpp
WORKDIR /whisper.cpp
# No GPU is present at build time, so the linker needs the Driver API stub
# (libcuda.so) that ships alongside the toolkit in this image specifically
# for this purpose — the real one is injected by the container runtime later.
ENV LIBRARY_PATH="/usr/local/cuda/targets/x86_64-linux/lib/stubs"
ENV LD_LIBRARY_PATH="/usr/local/cuda/targets/x86_64-linux/lib/stubs"
# The stub is just "libcuda.so" with no version suffix, but the final link
# needs to resolve the exact SONAME ("libcuda.so.1") baked into libggml-cuda's
# own NEEDED entry — the real one only exists once the container toolkit
# injects the actual driver at `docker run` time, not during this build.
RUN ln -sf libcuda.so /usr/local/cuda/targets/x86_64-linux/lib/stubs/libcuda.so.1
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release \
      -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=${CUDA_ARCH} -DCUDAToolkit_ROOT=/usr/local/cuda \
    && cmake --build build -j"$(nproc)" --target whisper-cli

# ---- node deps (own stage so native addons compile against the same base
# the app actually runs on, not whatever arch `node:*` images use) ----
FROM nvidia/cuda:${CUDA_IMAGE_TAG}-runtime-ubuntu24.04 AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates python3 make g++ \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- compile the TS app ----
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM nvidia/cuda:${CUDA_IMAGE_TAG}-runtime-ubuntu24.04 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY vosk/native ./vosk/native
COPY --from=whisper-builder \
  /whisper.cpp/build/bin/whisper-cli \
  /whisper.cpp/build/bin/libggml.so.0.27.0 \
  /whisper.cpp/build/bin/libggml-base.so.0.27.0 \
  /whisper.cpp/build/bin/libggml-cpu.so.0.27.0 \
  /whisper.cpp/build/bin/libggml-cuda.so.0.27.0 \
  /whisper.cpp/build/bin/libwhisper.so.1.9.5 \
  ./whisper/native/linux-x64/
RUN cd whisper/native/linux-x64 && \
    ln -s libggml.so.0.27.0 libggml.so.0 && ln -s libggml.so.0 libggml.so && \
    ln -s libggml-base.so.0.27.0 libggml-base.so.0 && ln -s libggml-base.so.0 libggml-base.so && \
    ln -s libggml-cpu.so.0.27.0 libggml-cpu.so.0 && ln -s libggml-cpu.so.0 libggml-cpu.so && \
    ln -s libggml-cuda.so.0.27.0 libggml-cuda.so.0 && ln -s libggml-cuda.so.0 libggml-cuda.so && \
    ln -s libwhisper.so.1.9.5 libwhisper.so.1 && ln -s libwhisper.so.1 libwhisper.so

CMD ["node", "dist/main.js"]
