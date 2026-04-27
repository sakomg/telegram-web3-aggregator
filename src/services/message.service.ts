import { TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { Api } from 'telegram/tl';
import { getPeerId } from 'telegram/Utils';
import { normalizeUsername } from '../utils/main.utils';
import { Logger } from './logger.service';

export class MessageService {
  private readonly botClient: TelegramClient;
  private readonly userClient: TelegramClient;
  private readonly logger = new Logger('MessageService');
  private readonly botPeerCache = new Map<string, Promise<any>>();
  private readonly userPeerCache = new Map<string, Promise<any>>();
  private readonly userEntityCache = new Map<string, Promise<any>>();
  private readonly userChatPeerIdCache = new Map<string, Promise<string>>();

  constructor(botClient: TelegramClient, userClient: TelegramClient) {
    this.botClient = botClient;
    this.userClient = userClient;
  }

  #getChannelKey(channel: string): string {
    return normalizeUsername(channel).toLowerCase();
  }

  async #getPeer(channel: string, clientType: 'BOT' | 'USER') {
    const cache = clientType === 'BOT' ? this.botPeerCache : this.userPeerCache;
    const client = clientType === 'BOT' ? this.botClient : this.userClient;
    const channelKey = this.#getChannelKey(channel);

    if (!cache.has(channelKey)) {
      cache.set(channelKey, client.getInputEntity(channelKey));
    }

    try {
      return await cache.get(channelKey);
    } catch (error) {
      cache.delete(channelKey);
      throw error;
    }
  }

  async #getUserEntity(channel: string) {
    const channelKey = this.#getChannelKey(channel);
    if (!this.userEntityCache.has(channelKey)) {
      this.userEntityCache.set(channelKey, this.userClient.getEntity(channelKey));
    }

    try {
      return await this.userEntityCache.get(channelKey)!;
    } catch (error) {
      this.userEntityCache.delete(channelKey);
      throw error;
    }
  }

  async #getUserChatPeerId(channel: string): Promise<string> {
    const channelKey = this.#getChannelKey(channel);
    if (!this.userChatPeerIdCache.has(channelKey)) {
      this.userChatPeerIdCache.set(
        channelKey,
        this.#getUserEntity(channelKey).then((entity) => getPeerId(entity)),
      );
    }

    try {
      return await this.userChatPeerIdCache.get(channelKey)!;
    } catch (error) {
      this.userChatPeerIdCache.delete(channelKey);
      throw error;
    }
  }

  async getUserChatPeerId(channel: string): Promise<string> {
    return this.#getUserChatPeerId(channel);
  }

  async getMessagesHistory(channel: string, limit: number) {
    let result: Record<string, any> = {
      success: true,
      value: null,
    };

    try {
      const peer = await this.#getPeer(channel, 'USER');
      result.success = true;
      result.value = await this.userClient.invoke(
        new Api.messages.GetHistory({
          peer,
          limit: limit,
        }),
      );
    } catch (e) {
      this.logger.error(`Failed to fetch history for ${channel}`, e);
      result.success = false;
      result.value = e;
    }

    return result;
  }

  async forwardMessages(fromChannel: string, toChannel: string, messageIds: Array<number>) {
    try {
      const fromPeer = await this.#getPeer(fromChannel, 'BOT');
      const toPeer = await this.#getPeer(toChannel, 'BOT');

      await this.botClient.invoke(
        new Api.messages.ForwardMessages({
          id: messageIds,
          fromPeer,
          toPeer,
          dropMediaCaptions: false,
          noforwards: false,
        }),
      );
    } catch (e) {
      throw new Error(`❌ Can't forward messages from ${fromChannel} to ${toChannel}. ` + e);
    }
  }

  async transcribeAudio(channel: string, msgId: string) {
    const peer = await this.#getPeer(channel, 'USER');
    const result: any = await this.userClient.invoke(
      new Api.messages.TranscribeAudio({
        peer,
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

    const peer = await this.#getPeer(channel, 'BOT');
    const result = await this.botClient.invoke(
      new Api.messages.SendMessage({
        peer,
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
    const peer = await this.#getPeer(channel, 'BOT');
    await this.botClient.invoke(
      new Api.messages.UpdatePinnedMessage({
        peer,
        id: messageId,
        silent: true,
      }),
    );
  }

  async editMessage(channel: string, messageId: number, text: string) {
    const peer = await this.#getPeer(channel, 'BOT');
    await this.botClient.editMessage(peer, {
      message: messageId,
      text,
    });
  }

  async addChannelMessageListener(chat: string, handler: (event: NewMessageEvent) => Promise<void>, chatPeerId?: string) {
    const resolvedChatPeerId = chatPeerId ?? (await this.#getUserChatPeerId(chat));
    const eventBuilder = new NewMessage({ chats: [resolvedChatPeerId] });
    this.userClient.addEventHandler(handler, eventBuilder);
    return eventBuilder;
  }

  addRawMessageListener(handler: (event: NewMessageEvent) => void) {
    const eventBuilder = new NewMessage({});
    this.userClient.addEventHandler(handler, eventBuilder);
    return eventBuilder;
  }

  removeRawMessageListener(handler: (event: NewMessageEvent) => void, eventBuilder: NewMessage) {
    this.userClient.removeEventHandler(handler, eventBuilder);
  }

  removeChannelMessageListener(handler: (event: NewMessageEvent) => Promise<void>, eventBuilder: NewMessage) {
    this.userClient.removeEventHandler(handler, eventBuilder);
  }
}
