import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import { normalizeUsername } from '../utils/main.utils';

export class MessageService {
  private readonly botClient;
  private readonly userClient;

  constructor(botClient: TelegramClient, userClient: TelegramClient) {
    this.botClient = botClient;
    this.userClient = userClient;
  }

  async getMessagesHistory(channel: string, limit: number) {
    const result: any = await this.userClient.invoke(
      new Api.messages.GetHistory({
        peer: normalizeUsername(channel),
        limit: limit,
      }),
    );

    return result;
  }

  async forwardMessages(fromChannel: string, toChannel: string, messageIds: Array<number>) {
    try {
      await this.botClient.invoke(
        new Api.messages.ForwardMessages({
          id: messageIds,
          fromPeer: normalizeUsername(fromChannel),
          toPeer: normalizeUsername(toChannel),
          dropMediaCaptions: false,
          noforwards: false,
        }),
      );
    } catch (e) {
      throw new Error(`❌ Can't forward messages from ${fromChannel} to ${toChannel}. ` + e);
    }
  }

  async transcribeAudio(toChannel: string, msgId: string) {
    const result: any = await this.userClient.invoke(
      new Api.messages.TranscribeAudio({
        peer: toChannel,
        msgId: parseInt(msgId),
      }),
    );

    return result;
  }
}
