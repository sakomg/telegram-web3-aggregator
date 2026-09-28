import { TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { MessageFilterService } from './filter.service';
import { Logger } from './logger.service';
import { MessageService } from './message.service';
import { channelsToMarkdown, delay, markdownToChannels, normalizeUsername } from '../utils/main.utils';

type ChannelState = {
  name: string;
  messageId: number;
};

type MsgGroup = { ids: number[]; lastId: number; lead: any };

type AlbumBuffer = MsgGroup & { timer: ReturnType<typeof setTimeout> };

export class SyncService {
  private readonly messageService: MessageService;
  private readonly messageFilterService: MessageFilterService;
  private readonly userClient: TelegramClient;
  private readonly recipients: string[];
  private readonly storageChannel: string;
  private readonly targetChannel: string;
  private readonly logger = new Logger('SyncService');
  private channelsState: ChannelState[] = [];
  private channelIdMap = new Map<string, ChannelState>();
  private storageMessageId: number | null = null;
  private persistedMarkdown = '';
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private isActive = false;
  private albumBuffers = new Map<string, AlbumBuffer>();
  private messageHandler: ((event: NewMessageEvent) => Promise<void>) | null = null;
  private channelQueues = new Map<string, Promise<void>>();
  private catchUpTimer: ReturnType<typeof setInterval> | null = null;
  private isCatchingUp = false;
  private unsubscribedKey = '';

  private static readonly CATCH_UP_DELAY_MS = 2_000;
  private static readonly CATCH_UP_INTERVAL_MS = 5 * 60_000;
  private static readonly PERSIST_DELAY_MS = 10_000;
  private static readonly ALBUM_WAIT_MS = 500;

  constructor(
    config: any,
    messageService: MessageService,
    messageFilterService: MessageFilterService,
    userClient: TelegramClient,
    recipients: string[],
  ) {
    this.messageService = messageService;
    this.messageFilterService = messageFilterService;
    this.userClient = userClient;
    this.recipients = recipients;
    this.storageChannel = config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME');
    this.targetChannel = config.get('TELEGRAM_TARGET_CHANNEL_USERNAME');
  }

  async start() {
    if (this.isActive) await this.stop();
    this.isActive = true;

    await this.#loadChannelsState();
    this.#registerHandler();

    // Live updates are not guaranteed to arrive (reconnects, update gaps),
    // so history is reconciled on start and then periodically
    await this.#catchUp();
    this.catchUpTimer = setInterval(() => {
      this.#catchUp().catch((e) => this.logger.error('Periodic catch-up failed', e));
    }, SyncService.CATCH_UP_INTERVAL_MS);

    this.logger.info(`Live sync active for ${this.channelsState.length} channels`);
    await this.#notify(`🔄 Sync started for <b>${this.channelsState.length}</b> channels.`);
  }

  async stop() {
    if (!this.isActive) return;

    this.logger.info('Stopping sync');
    this.isActive = false;

    if (this.catchUpTimer) {
      clearInterval(this.catchUpTimer);
      this.catchUpTimer = null;
    }

    if (this.messageHandler) {
      this.userClient.removeEventHandler(this.messageHandler, new NewMessage({}));
      this.messageHandler = null;
    }

    for (const buf of this.albumBuffers.values()) clearTimeout(buf.timer);
    this.albumBuffers.clear();

    await this.#flushPersist();
  }

  async addChannel(rawName: string): Promise<boolean> {
    const name = normalizeUsername(rawName);
    await this.#ensureLoaded();
    if (this.#findChannel(name)) return false;

    // Start from the current post so the channel history is not replayed
    const latest = await this.messageService.getLatestMessage(name);
    const channel: ChannelState = { name, messageId: latest?.id ?? 0 };
    this.channelsState.push(channel);

    const channelId = await this.messageService.getChannelId(name);
    if (channelId) this.channelIdMap.set(channelId, channel);

    await this.#persistChannelsState();
    return true;
  }

  async removeChannel(rawName: string): Promise<boolean> {
    const name = normalizeUsername(rawName);
    await this.#ensureLoaded();
    const channel = this.#findChannel(name);
    if (!channel) return false;

    this.channelsState = this.channelsState.filter((ch) => ch !== channel);
    for (const [id, ch] of this.channelIdMap) {
      if (ch === channel) this.channelIdMap.delete(id);
    }

    await this.#persistChannelsState();
    return true;
  }

  async #ensureLoaded() {
    if (this.storageMessageId || (await this.#loadChannelsState())) return;
    throw new Error('Storage channel is unavailable');
  }

  #findChannel(name: string): ChannelState | undefined {
    const key = name.toLowerCase();
    return this.channelsState.find((ch) => ch.name.toLowerCase() === key);
  }

  async #catchUp() {
    if (this.isCatchingUp) return;
    this.isCatchingUp = true;

    try {
      const topIds = await this.#scanChannels();
      for (const channel of this.channelsState) {
        if (!this.isActive) break;

        const topId = topIds.get(channel);
        if (topId !== undefined && topId <= channel.messageId) continue;

        await this.#enqueue(channel, () => this.#syncChannel(channel, '[CatchUp]'));
        await delay(SyncService.CATCH_UP_DELAY_MS);
      }
      this.#schedulePersist();
    } finally {
      this.isCatchingUp = false;
    }
  }

  // Rebuilds the channel id map from the dialog list and returns top message ids,
  // so only channels with new posts need a history request
  async #scanChannels(): Promise<Map<ChannelState, number>> {
    const byUsername = new Map<string, { id: string; topMessageId: number }>();
    for (const ch of await this.messageService.getSubscribedChannels()) {
      for (const username of ch.usernames) byUsername.set(username.toLowerCase(), ch);
    }

    const idMap = new Map<string, ChannelState>();
    const topIds = new Map<ChannelState, number>();
    const unsubscribed: string[] = [];

    for (const channel of this.channelsState) {
      const found = byUsername.get(normalizeUsername(channel.name).slice(1).toLowerCase());
      if (found) {
        idMap.set(found.id, channel);
        topIds.set(channel, found.topMessageId);
        continue;
      }

      unsubscribed.push(channel.name);
      const channelId = await this.messageService.getChannelId(channel.name);
      if (channelId) idMap.set(channelId, channel);
    }

    this.channelIdMap = idMap;

    const key = unsubscribed.join(',');
    if (key !== this.unsubscribedKey) {
      this.unsubscribedKey = key;
      if (unsubscribed.length) {
        this.logger.warn(`User is not subscribed to ${unsubscribed.length} channel(s), they are polled only: ${key}`);
      }
    }

    return topIds;
  }

  // Serializes all work per channel so live and catch-up never forward the same message twice
  #enqueue(channel: ChannelState, task: () => Promise<void>): Promise<void> {
    const prev = this.channelQueues.get(channel.name) ?? Promise.resolve();
    const next = prev.then(task).catch((e) => this.logger.error(`Sync task failed for ${channel.name}`, e));
    this.channelQueues.set(channel.name, next);
    next.then(() => {
      if (this.channelQueues.get(channel.name) === next) this.channelQueues.delete(channel.name);
    });
    return next;
  }

  async #syncChannel(channel: ChannelState, tag: string) {
    if (channel.messageId === 0) {
      const latest = await this.messageService.getLatestMessage(channel.name);
      if (latest) {
        channel.messageId = latest.id;
        this.logger.info(`${tag} Baseline for ${channel.name} set to ${latest.id}`);
      }
      return;
    }

    const messages = await this.messageService.getMessagesSince(channel.name, channel.messageId);
    for (const group of this.#groupMessages(messages.reverse(), channel.messageId)) {
      if (!this.isActive) return;
      await this.#processGroup(group, channel, tag);
    }
  }

  #handleLive(group: MsgGroup, channel: ChannelState) {
    return this.#enqueue(channel, async () => {
      if (!this.isActive || group.lastId <= channel.messageId) return;

      if (channel.messageId > 0 && group.ids[0] > channel.messageId + 1) {
        this.logger.warn(`[Gap] ${channel.name}: expected ${channel.messageId + 1}, got ${group.ids[0]}. Fetching history`);
        await this.#syncChannel(channel, '[Gap]');
      } else {
        await this.#processGroup(group, channel, '[Live]');
      }

      this.#schedulePersist();
    });
  }

  #registerHandler() {
    if (this.messageHandler) {
      this.userClient.removeEventHandler(this.messageHandler, new NewMessage({}));
    }

    this.messageHandler = async (event: NewMessageEvent) => {
      if (!this.isActive) return;

      const msg = event.message;
      const channelId = (msg?.peerId as any)?.channelId?.toString();
      const channel = channelId && this.channelIdMap.get(channelId);
      if (!msg?.id || !channel) return;

      if (msg.groupedId) {
        this.#bufferAlbum(channel, msg);
      } else {
        await this.#handleLive({ ids: [msg.id], lastId: msg.id, lead: msg }, channel);
      }
    };

    this.userClient.addEventHandler(this.messageHandler, new NewMessage({}));
  }

  // Album parts arrive as separate updates; wait for the rest before forwarding them together
  #bufferAlbum(channel: ChannelState, msg: any) {
    const gid = msg.groupedId.toString();
    const flush = () => {
      const buf = this.albumBuffers.get(gid);
      if (!buf) return;
      this.albumBuffers.delete(gid);
      buf.ids.sort((a, b) => a - b);
      this.#handleLive(buf, channel);
    };

    const existing = this.albumBuffers.get(gid);
    if (existing) {
      clearTimeout(existing.timer);
      this.#addToGroup(existing, msg);
      existing.timer = setTimeout(flush, SyncService.ALBUM_WAIT_MS);
    } else {
      this.albumBuffers.set(gid, { ids: [msg.id], lastId: msg.id, lead: msg, timer: setTimeout(flush, SyncService.ALBUM_WAIT_MS) });
    }
  }

  // The album caption may sit on any part, and the filter needs it
  #addToGroup(group: MsgGroup, msg: any) {
    group.ids.push(msg.id);
    group.lastId = Math.max(group.lastId, msg.id);
    if (!group.lead.message && msg.message) group.lead = msg;
  }

  async #processGroup(group: MsgGroup, channel: ChannelState, tag: string) {
    channel.messageId = group.lastId;

    const invalidReason = this.messageFilterService.getInvalidReason(group.lead);
    if (invalidReason !== null) {
      this.logger.info(`${tag} Skipped ${group.lead.id} from ${channel.name} (reason: ${invalidReason})`);
      return;
    }

    try {
      await this.messageService.forwardMessages(channel.name, this.targetChannel, group.ids);
      this.logger.info(`${tag} Forwarded [${group.ids.join(',')}] from ${channel.name}`);
    } catch (e) {
      this.logger.error(`${tag} Failed to forward [${group.ids.join(',')}] from ${channel.name}`, e);
      await this.#notify(`❌ Failed to forward <b>${group.ids.join(',')}</b> from <b>${channel.name}</b>: ${String(e).slice(0, 200)}`);
    }
  }

  #groupMessages(messages: any[], afterId: number): MsgGroup[] {
    const groups: MsgGroup[] = [];
    for (const msg of messages) {
      if (!msg.id || msg.id <= afterId) continue;
      const prev = groups[groups.length - 1];
      const gid = msg.groupedId?.toString();
      if (gid && prev && prev.lead.groupedId?.toString() === gid) {
        this.#addToGroup(prev, msg);
      } else {
        groups.push({ ids: [msg.id], lastId: msg.id, lead: msg });
      }
    }
    return groups;
  }

  async #loadChannelsState(): Promise<boolean> {
    let storageMessage: any;
    try {
      storageMessage = await this.messageService.getLatestMessage(this.storageChannel);
    } catch (e) {
      this.logger.error('Cannot read storage channel', e);
      await this.#notify('❗ Cannot read storage channel.');
      return false;
    }

    if (!storageMessage) {
      this.logger.warn('Storage channel is empty');
      await this.#notify('🗑️ Storage channel is empty.');
      return false;
    }

    this.storageMessageId = storageMessage.id;
    this.persistedMarkdown = storageMessage.message;

    // Reuse existing objects so queued tasks keep updating the live state,
    // and never move a cursor backwards if storage lags behind memory
    const known = new Map(this.channelsState.map((ch) => [ch.name, ch]));
    this.channelsState = markdownToChannels(storageMessage.message).map((stored: ChannelState) => {
      const existing = known.get(stored.name);
      if (!existing) return stored;
      existing.messageId = Math.max(existing.messageId, stored.messageId);
      return existing;
    });
    this.logger.info(`Loaded ${this.channelsState.length} channels from storage`);
    return true;
  }

  // Cursor updates are batched into one storage edit instead of one per forwarded post
  #schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.#persistChannelsState().catch((e) => this.logger.error('Failed to persist channels state', e));
    }, SyncService.PERSIST_DELAY_MS);
  }

  async #flushPersist() {
    if (!this.persistTimer) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    await this.#persistChannelsState();
  }

  async #persistChannelsState() {
    if (!this.storageMessageId) return;
    const markdown = channelsToMarkdown(this.channelsState);
    if (markdown.trim() === this.persistedMarkdown.trim()) return;

    await this.messageService.editMessage(this.storageChannel, this.storageMessageId, markdown);
    this.persistedMarkdown = markdown;
  }

  async #notify(text: string) {
    for (const recipient of this.recipients) {
      try {
        await this.messageService.sendMessage(recipient, text);
      } catch (e) {
        this.logger.warn(`Failed to notify ${recipient}`, e);
      }
    }
  }
}
