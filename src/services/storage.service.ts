import { ChannelState } from '../types/channel-state.type';
import { channelsToChunks, markdownToChannels, parsePartMarker } from '../utils/main.utils';
import { Logger } from './logger.service';
import { MessageService } from './message.service';

// Channel list lives in the storage channel as the latest message,
// or as the latest N messages marked "Part i/N" once it exceeds one message
export class StorageService {
  private readonly messageService: MessageService;
  private readonly channel: string;
  private readonly logger = new Logger('StorageService');
  private messageIds: number[] = [];
  private persisted: string[] = [];
  private saving: Promise<void> = Promise.resolve();

  constructor(messageService: MessageService, channel: string) {
    this.messageService = messageService;
    this.channel = channel;
  }

  get isLoaded(): boolean {
    return this.messageIds.length > 0;
  }

  async load(): Promise<ChannelState[] | null> {
    const latest = await this.messageService.getLatestMessage(this.channel);
    if (!latest?.message) return null;

    let messages = [latest];
    const marker = parsePartMarker(latest.message);
    if (marker && marker.part === marker.total) {
      const parts = (await this.messageService.getLatestMessages(this.channel, marker.total)).reverse();
      const consistent = parts.every((m, i) => parsePartMarker(m.message ?? '')?.part === i + 1);
      if (consistent) messages = parts;
      else this.logger.warn(`Storage parts are inconsistent, using the latest message only`);
    }

    this.messageIds = messages.map((m) => m.id);
    this.persisted = messages.map((m) => m.message);
    return messages.flatMap((m) => markdownToChannels(m.message));
  }

  save(channels: ChannelState[]): Promise<void> {
    const run = this.saving.then(() => this.#write(channelsToChunks(channels)));
    this.saving = run.catch(() => {});
    return run;
  }

  async #write(chunks: string[]) {
    if (!this.isLoaded) return;

    for (let i = 0; i < chunks.length; i++) {
      if (i >= this.messageIds.length) {
        this.messageIds.push(await this.messageService.postMessage(this.channel, chunks[i]));
      } else if (chunks[i].trim() !== this.persisted[i]?.trim()) {
        await this.messageService.editMessage(this.channel, this.messageIds[i], chunks[i]);
      }
      this.persisted[i] = chunks[i];
    }

    if (this.messageIds.length > chunks.length) {
      await this.messageService.deleteMessages(this.channel, this.messageIds.slice(chunks.length));
      this.messageIds = this.messageIds.slice(0, chunks.length);
      this.persisted = this.persisted.slice(0, chunks.length);
    }
  }
}
