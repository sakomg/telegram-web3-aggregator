import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import { FloodWaitError } from 'telegram/errors';
import { normalizeUsername, delay } from '../utils/main.utils';
import { Logger } from './logger.service';

export type SubscribedChannel = {
  id: string;
  usernames: string[];
  topMessageId: number;
};

export class MessageService {
  private readonly botClient: TelegramClient;
  private readonly userClient: TelegramClient;
  private readonly logger = new Logger('MessageService');
  private readonly botPeerCache = new Map<string, Promise<any>>();
  private readonly userPeerCache = new Map<string, Promise<any>>();

  private static readonly HISTORY_PAGE_SIZE = 100;
  private static readonly HISTORY_MAX_PAGES = 5;

  constructor(botClient: TelegramClient, userClient: TelegramClient) {
    this.botClient = botClient;
    this.userClient = userClient;
  }

  #getChannelKey(channel: string): string {
    return normalizeUsername(channel).toLowerCase();
  }

  async #withFloodWait<T>(label: string, fn: () => Promise<T>): Promise<T> {
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof FloodWaitError)) throw e;
        this.logger.warn(`FloodWait on ${label}: waiting ${e.seconds}s`);
        await delay(e.seconds * 1000);
      }
    }
  }

  async #getPeer(channel: string, clientType: 'BOT' | 'USER'): Promise<any> {
    const cache = clientType === 'BOT' ? this.botPeerCache : this.userPeerCache;
    const client = clientType === 'BOT' ? this.botClient : this.userClient;
    const channelKey = this.#getChannelKey(channel);

    if (!cache.has(channelKey)) {
      const peer = this.#withFloodWait(`resolve ${channelKey}`, () => client.getInputEntity(channelKey));
      cache.set(channelKey, peer);
      peer.catch(() => cache.delete(channelKey));
    }

    return cache.get(channelKey);
  }

  async getLatestMessage(channel: string): Promise<any | undefined> {
    const peer = await this.#getPeer(channel, 'USER');
    const result: any = await this.#withFloodWait(`history ${channel}`, () =>
      this.userClient.invoke(new Api.messages.GetHistory({ peer, limit: 1 })),
    );
    return result.messages?.[0];
  }

  // Newest-first pages bounded by minId, so a long gap is not truncated to one page
  async getMessagesSince(channel: string, minId: number): Promise<any[]> {
    const peer = await this.#getPeer(channel, 'USER');
    const limit = MessageService.HISTORY_PAGE_SIZE;
    const messages: any[] = [];
    let offsetId = 0;

    for (let page = 0; page < MessageService.HISTORY_MAX_PAGES; page++) {
      const result: any = await this.#withFloodWait(`history ${channel}`, () =>
        this.userClient.invoke(new Api.messages.GetHistory({ peer, limit, minId, offsetId })),
      );
      const batch: any[] = result.messages ?? [];
      messages.push(...batch);
      if (batch.length < limit) break;
      offsetId = batch[batch.length - 1].id;
    }

    return messages;
  }

  // One paged dialogs request covers every joined channel: it returns their top message ids
  // and warms the peer cache, replacing per-channel username resolution and history polling
  async getSubscribedChannels(): Promise<SubscribedChannel[]> {
    const dialogs = await this.#withFloodWait('dialogs', () => this.userClient.getDialogs({}));
    const channels: SubscribedChannel[] = [];

    for (const dialog of dialogs) {
      const entity: any = dialog.entity;
      if (!dialog.isChannel || !entity) continue;

      const usernames = [entity.username, ...(entity.usernames ?? []).map((u: any) => u.username)].filter(Boolean);
      for (const username of usernames) {
        this.userPeerCache.set(this.#getChannelKey(username), Promise.resolve(dialog.inputEntity));
      }

      channels.push({ id: entity.id.toString(), usernames, topMessageId: dialog.message?.id ?? 0 });
    }

    return channels;
  }

  async resolveChannel(channel: string): Promise<any> {
    return this.#withFloodWait(`resolve ${channel}`, () => this.userClient.getEntity(this.#getChannelKey(channel)));
  }

  async forwardMessages(fromChannel: string, toChannel: string, messageIds: number[]) {
    const fromPeer = await this.#getPeer(fromChannel, 'USER');
    const toPeer = await this.#getPeer(toChannel, 'USER');
    await this.#withFloodWait(`forward from ${fromChannel}`, () =>
      this.userClient.invoke(new Api.messages.ForwardMessages({ id: messageIds, fromPeer, toPeer })),
    );
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

  async sendMessage(recipient: string, text: string) {
    await this.botClient.sendMessage(recipient, { message: text, parseMode: 'html' });
  }

  async editMessage(channel: string, messageId: number, text: string) {
    const peer = await this.#getPeer(channel, 'BOT');
    try {
      await this.#withFloodWait(`edit ${channel}`, () => this.botClient.editMessage(peer, { message: messageId, text }));
    } catch (e) {
      if (!String(e).includes('MESSAGE_NOT_MODIFIED')) throw e;
    }
  }
}
