import { ChannelState } from '../types/channel-state.type';

const TABLE_HEADER = '| Name | Message ID |\n| ---- | ---------- |';
const PART_MARKER = /^Part (\d+)\/(\d+)$/m;
const MAX_CHUNK_LENGTH = 3_900;

export function normalizeUsername(username: string): string {
  return username.startsWith('@') ? username : `@${username}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function markdownToChannels(markdownContent: string): ChannelState[] {
  return markdownContent
    .trim()
    .split('\n')
    .slice(2)
    .flatMap((row) => {
      const [name, messageId] = row.trim().split('|').slice(1, 3).map((cell) => cell.trim());
      return name && messageId ? [{ name, messageId: parseInt(messageId) }] : [];
    });
}

export function channelsToChunks(channels: ChannelState[]): string[] {
  const groups: string[][] = [[]];
  let length = 0;
  for (const ch of channels) {
    const row = `| ${ch.name} | ${ch.messageId} |`;
    if (length + row.length + 1 > MAX_CHUNK_LENGTH && groups[groups.length - 1].length) {
      groups.push([]);
      length = 0;
    }
    groups[groups.length - 1].push(row);
    length += row.length + 1;
  }

  const table = (rows: string[]) => `${TABLE_HEADER}\n${rows.join('\n')}`;
  if (groups.length === 1) return [table(groups[0])];
  return groups.map((rows, i) => `${table(rows)}\n\nPart ${i + 1}/${groups.length}`);
}

export function parsePartMarker(text: string): { part: number; total: number } | null {
  const match = text.match(PART_MARKER);
  return match ? { part: Number(match[1]), total: Number(match[2]) } : null;
}

export function clearChannelName(url?: string): string | null {
  const trimmed = url?.trim().replace(/^https:\/\/t\.me\//, '');
  return trimmed ? normalizeUsername(trimmed) : null;
}
