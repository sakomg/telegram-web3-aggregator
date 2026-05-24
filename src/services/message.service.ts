import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import { FloodWaitError } from 'telegram/errors';
import { normalizeUsername, delay } from '../utils/main.utils';
import { Logger } from './logger.service';

export class MessageService {
  private readonly botClient: TelegramClient;
  private readonly userClient: TelegramClient;
  private readonly logger = new Logger('MessageService');
  private readonly botPeerCache = new Map<string, Promise<any>>();
  private readonly userPeerCache = new Map<string, Promise<any>>();

  constructor(botClient: TelegramClient, userClient: TelegramClient) {
    this.botClient = botClient;
    this.userClient = userClient;
  }

  #getChannelKey(channel: string): string {
    return normalizeUsername(channel).toLowerCase();
  }

  async #getPeer(channel: string, clientType: 'BOT' | 'USER'): Promise<any> {
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
      if (error instanceof FloodWaitError) {
        this.logger.warn(`FloodWait resolving peer ${channelKey}: waiting ${error.seconds}s`);
        await delay(error.seconds * 1000);
        return this.#getPeer(channel, clientType);
      }
      throw error;
    }
  }

  async getMessagesHistory(channel: string, limit: number): Promise<Record<string, any>> {
    const result: Record<string, any> = { success: true, value: null };
    try {
      const peer = await this.#getPeer(channel, 'USER');
      result.value = await this.userClient.invoke(new Api.messages.GetHistory({ peer, limit }));
    } catch (e) {
      if (e instanceof FloodWaitError) {
        this.logger.warn(`FloodWait on getMessagesHistory for ${channel}: waiting ${e.seconds}s`);
        await delay(e.seconds * 1000);
        return this.getMessagesHistory(channel, limit);
      }
      this.logger.error(`Failed to fetch history for ${channel}`, e);
      result.success = false;
      result.value = e;
    }
    return result;
  }

  async getMessagesSince(channel: string, minId: number, limit = 50): Promise<Record<string, any>> {
    const result: Record<string, any> = { success: true, value: null };
    try {
      const peer = await this.#getPeer(channel, 'USER');
      result.value = await this.userClient.invoke(new Api.messages.GetHistory({ peer, limit, minId }));
    } catch (e) {
      if (e instanceof FloodWaitError) {
        this.logger.warn(`FloodWait on getMessagesSince for ${channel}: waiting ${e.seconds}s`);
        await delay(e.seconds * 1000);
        return this.getMessagesSince(channel, minId, limit);
      }
      this.logger.error(`Failed to fetch messages since ${minId} for ${channel}`, e);
      result.success = false;
      result.value = e;
    }
    return result;
  }

  async forwardMessages(fromChannel: string, toChannel: string, messageIds: number[]) {
    try {
      const fromPeer = await this.#getPeer(fromChannel, 'USER');
      const toPeer = await this.#getPeer(toChannel, 'USER');
      await this.userClient.invoke(
        new Api.messages.ForwardMessages({ id: messageIds, fromPeer, toPeer, dropMediaCaptions: false, noforwards: false }),
      );
    } catch (e) {
      throw new Error(`❌ Can't forward messages from ${fromChannel} to ${toChannel}. ` + e);
    }
  }

  async joinChannel(channel: string) {
    const peer = await this.#getPeer(channel, 'USER');
    await this.userClient.invoke(new Api.channels.JoinChannel({ channel: peer }));
  }

  async leaveChannel(channel: string) {
    const peer = await this.#getPeer(channel, 'USER');
    await this.userClient.invoke(new Api.channels.LeaveChannel({ channel: peer }));
  }

  async getChannelId(channel: string): Promise<string | null> {
    try {
      const peer = await this.#getPeer(channel, 'USER');
      return peer.channelId?.toString() ?? null;
    } catch {
      return null;
    }
  }

  async editMessage(channel: string, messageId: number, text: string) {
    const peer = await this.#getPeer(channel, 'BOT');
    try {
      await this.botClient.editMessage(peer, { message: messageId, text });
    } catch (e) {
      if (!String(e).includes('MESSAGE_NOT_MODIFIED')) throw e;
    }
  }
}
