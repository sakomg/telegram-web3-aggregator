export function normalizeUsername(username: string): string {
  if (username.startsWith('@')) return username;
  else return `@${username}`;
}

export function delay(time: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

export function markdownToChannels(markdownContent: string): Array<any> {
  const channels: Array<any> = [];
  const rows = markdownContent.trim().split('\n').slice(2);

  rows.forEach((row) => {
    const [name, messageId] = row
      .trim()
      .split('|')
      .slice(1, 3)
      .map((cell) => cell.trim());
    if (name && messageId) {
      channels.push({ name, messageId: parseInt(messageId) });
    }
  });

  return channels;
}

export function channelsToMarkdown(channels: Array<any>): string {
  let markdown = '| Name | Message ID |\n';
  markdown += '| ---- | ---------- |\n';
  channels.forEach((channel) => {
    markdown += `| ${channel.name} | ${channel.messageId} |\n`;
  });
  return markdown;
}

export function clearChannelName(url: string): string | null {
  if (typeof url !== 'string') return null;
  const trimmedUrl = url.trim();
  if (trimmedUrl.startsWith('https://t.me/')) return `@${trimmedUrl.slice(13)}`;
  if (trimmedUrl.startsWith('@')) return trimmedUrl;
  return `@${trimmedUrl}`;
}
