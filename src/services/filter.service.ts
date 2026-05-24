type FilterableMessage = {
  message?: string | null;
  media?: unknown;
  entities?: Array<{ className?: string }>;
};

export class MessageFilterService {
  private readonly adKeywords = ['реклама', '#ad', 'sponsored', 'promo', 'промокод'];
  private readonly minTextChars = 8;
  private readonly minWordsWithoutLink = 3;
  private readonly linkEntityClassNames = new Set(['MessageEntityUrl', 'MessageEntityTextUrl']);

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private hasLink(text: string, entities?: Array<{ className?: string }>): boolean {
    if (/(https?:\/\/|t\.me\/)/i.test(text)) {
      return true;
    }
    return entities?.some((entity) => this.linkEntityClassNames.has(entity.className ?? '')) ?? false;
  }

  private hasAdKeyword(normalizedText: string): boolean {
    return this.adKeywords.some((keyword) => normalizedText.includes(keyword.toLowerCase()));
  }

  private isLowValueText(normalizedText: string, hasLink: boolean): boolean {
    if (!normalizedText) {
      return true;
    }

    const wordCount = normalizedText.split(/\s+/).length;
    if (normalizedText.length < this.minTextChars) {
      return true;
    }

    if (!hasLink && wordCount < this.minWordsWithoutLink) {
      return true;
    }

    return false;
  }

  getInvalidReason(message: FilterableMessage): string | null {
    const rawText = message.message ?? '';
    const normalizedText = this.normalizeText(rawText);
    const hasMedia = Boolean(message.media);
    const containsLink = this.hasLink(rawText, message.entities);

    if (!normalizedText && !hasMedia) {
      return 'empty_message';
    }

    if (this.hasAdKeyword(normalizedText)) {
      return 'ad_keyword';
    }

    if (!hasMedia && this.isLowValueText(normalizedText, containsLink)) {
      return 'low_value_text';
    }

    return null;
  }
}
