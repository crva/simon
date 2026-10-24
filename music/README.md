# Music Cache

Music is streamed directly from YouTube, not downloaded before playing.

If `MUSIC_CACHE_ENABLED=true` (see root `README.md`), each played track is also saved here as `<youtube-video-id>.audio`, so requesting the same song again plays instantly from disk instead of re-streaming. When caching is disabled (the default), nothing is written here.

Files are never deleted automatically — remove this folder's contents manually if you want to reclaim disk space.
