export default class MessageFilterService {
  private adKeywords: string[];

  constructor() {
    this.adKeywords = ['sponsored', 'ad', 'promotion', 'Сделать репост', 'приз', 'подписка', 'акция'];
  }

  isAd(message: string): boolean {
    if (!message) return true;
    return this.adKeywords.some((keyword) => message.includes(keyword));
  }

  filterAds(messages: string[]): string[] {
    return messages.filter((msg: any) => !this.isAd(msg.message));
  }
}
