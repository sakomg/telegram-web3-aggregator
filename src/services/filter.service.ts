export default class MessageFilterService {
  private adKeywords: string[];

  constructor() {
    this.adKeywords = ['реклама'];
  }

  isAd(message: string): boolean {
    if (!message) return true;
    const wordCount = message.trim().split(/\s+/).length;
    if (wordCount <= 2) {
      return true;
    }
    return this.adKeywords.some((keyword) => message.includes(keyword));
  }

  filterGarbage(messages: string[]): string[] {
    return messages.filter((msg: any) => !this.isAd(msg.message));
  }
}
