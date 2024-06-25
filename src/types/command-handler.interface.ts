export interface CommandHandler {
  handle(botClient: any, sender: any, message?: string): Promise<void> | void;
}
