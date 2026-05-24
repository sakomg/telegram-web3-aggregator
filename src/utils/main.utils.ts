export function normalizeUsername(username: string): string {
  return username.startsWith('@') ? username : `@${username}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function markdownToChannels(markdownContent: string): Array<any> {
  return markdownContent
    .trim()
    .split('\n')
    .slice(2)
    .flatMap((row) => {
      const [name, messageId] = row.trim().split('|').slice(1, 3).map((cell) => cell.trim());
      return name && messageId ? [{ name, messageId: parseInt(messageId) }] : [];
    });
}

export function channelsToMarkdown(channels: Array<any>): string {
  const rows = channels.map((ch) => `| ${ch.name} | ${ch.messageId} |`).join('\n');
  return `| Name | Message ID |\n| ---- | ---------- |\n${rows}\n`;
}

export function clearChannelName(url: string): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('https://t.me/')) return `@${trimmed.slice(13)}`;
  if (trimmed.startsWith('@')) return trimmed;
  return `@${trimmed}`;
}
