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
    let result: any = null;

    try {
      result = await this.userClient.invoke(
        new Api.messages.GetHistory({
          peer: normalizeUsername(channel),
          limit: limit,
        }),
      );
    } catch (e) {
      console.log(e);
    }

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

  async transcribeAudio(channel: string, msgId: string) {
    const result: any = await this.userClient.invoke(
      new Api.messages.TranscribeAudio({
        peer: channel,
        msgId: parseInt(msgId),
      }),
    );

    return result;
  }

  async sendMessageWithMarkup(channel: string, matches: RegExpExecArray) {
    const [command, buttonLabel, buttonLink, restText] = matches;

    if (matches.length !== 4) {
      throw new Error('Specify message after pin command');
    }

    if (!buttonLabel || !buttonLink || !restText) {
      throw new Error(`Pls specify correct message format.\r\n- ❌ ${matches.join(' ')} \r\n- ✅ /pin label - url - text`);
    }

    const result = await this.botClient.invoke(
      new Api.messages.SendMessage({
        peer: channel,
        message: restText,
        replyMarkup: new Api.ReplyInlineMarkup({
          rows: [
            new Api.KeyboardButtonRow({
              buttons: [
                new Api.KeyboardButtonUrl({
                  text: buttonLabel,
                  url: buttonLink,
                }),
              ],
            }),
          ],
        }),
      }),
    );

    return result;
  }

  async pinMessage(channel: string, messageId: number) {
    await this.botClient.invoke(
      new Api.messages.UpdatePinnedMessage({
        peer: channel,
        id: messageId,
        silent: true,
      }),
    );
  }
}
