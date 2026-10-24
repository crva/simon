export interface Track {
  url: string;
  title: string;
}

export class MusicQueue {
  private tracks: Track[] = [];

  enqueue(track: Track): void {
    this.tracks.push(track);
  }

  next(): Track | undefined {
    return this.tracks.shift();
  }

  clear(): void {
    this.tracks = [];
  }

  get size(): number {
    return this.tracks.length;
  }
}
