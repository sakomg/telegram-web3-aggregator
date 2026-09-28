type FilterableMessage = {
  message?: string | null;
  media?: unknown;
  entities?: Array<{ className?: string }>;
};

export class MessageFilterService {
  // Whole-word matches only: "#ad" must not hit "#address", "promo" must not hit "promotion"
  private readonly adPattern =
    /(?<![\p{L}\p{N}_])(#?реклам\p{L}*|#ad|#ads|sponsored|promo|promos|promocode|промокод\p{L}*)(?![\p{L}\p{N}_])/iu;
  private readonly minTextChars = 8;
  private readonly minWordsWithoutLink = 3;
  private readonly linkEntityClassNames = new Set(['MessageEntityUrl', 'MessageEntityTextUrl']);

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private hasLink(text: string, entities?: Array<{ className?: string }>): boolean {
    if (/(https?:\/\/|t\.me\/)/i.test(text)) return true;
    return entities?.some((e) => this.linkEntityClassNames.has(e.className ?? '')) ?? false;
  }

  private isLowValueText(normalizedText: string, hasLink: boolean): boolean {
    if (normalizedText.length < this.minTextChars) return true;
    if (!hasLink && normalizedText.split(/\s+/).length < this.minWordsWithoutLink) return true;
    return false;
  }

  getInvalidReason(message: FilterableMessage): string | null {
    const rawText = message.message ?? '';
    const normalizedText = this.normalizeText(rawText);
    const hasMedia = Boolean(message.media);
    const containsLink = this.hasLink(rawText, message.entities);

    if (!normalizedText && !hasMedia) return 'empty_message';
    if (this.adPattern.test(normalizedText)) return 'ad_keyword';
    if (!hasMedia && this.isLowValueText(normalizedText, containsLink)) return 'low_value_text';

    return null;
  }
}
