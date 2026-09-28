import { createHash } from 'crypto';

type DuplicateCandidate = {
  id?: number;
  peerId?: any;
  message?: string | null;
  media?: any;
  fwdFrom?: any;
};

// Remembers recently forwarded posts so the same news reposted by several channels goes out once
export class DuplicateService {
  private readonly seen = new Map<string, number>();

  private static readonly TTL_MS = 24 * 60 * 60_000;
  private static readonly MAX_ENTRIES = 5_000;
  // Short captions ("🔥", "gm") collide too often to be a duplicate signal
  private static readonly MIN_TEXT_LENGTH = 40;

  #keys(message: DuplicateCandidate): string[] {
    const keys: string[] = [];

    // An original post and its forwards from other channels share one "post" key
    const fwd = message.fwdFrom;
    const fwdChannel = fwd?.fromId?.channelId;
    if (fwdChannel && fwd.channelPost) keys.push(`post:${fwdChannel}:${fwd.channelPost}`);
    const ownChannel = message.peerId?.channelId;
    if (!fwd && ownChannel && message.id) keys.push(`post:${ownChannel}:${message.id}`);

    const media = message.media;
    const mediaId = media?.photo?.id ?? media?.document?.id;
    if (mediaId) keys.push(`media:${mediaId}`);

    const text = (message.message ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.length >= DuplicateService.MIN_TEXT_LENGTH) {
      keys.push(`text:${createHash('sha1').update(text).digest('hex')}`);
    }

    return keys;
  }

  isDuplicate(message: DuplicateCandidate): boolean {
    const now = Date.now();
    return this.#keys(message).some((key) => {
      const seenAt = this.seen.get(key);
      return seenAt !== undefined && now - seenAt < DuplicateService.TTL_MS;
    });
  }

  remember(message: DuplicateCandidate) {
    const now = Date.now();
    for (const key of this.#keys(message)) {
      this.seen.delete(key);
      this.seen.set(key, now);
    }

    // Map keeps insertion order, so the oldest entries come first
    for (const key of this.seen.keys()) {
      if (this.seen.size <= DuplicateService.MAX_ENTRIES) break;
      this.seen.delete(key);
    }
  }
}
