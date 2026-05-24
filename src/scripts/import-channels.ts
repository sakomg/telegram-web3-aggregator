import 'dotenv/config';
import config from 'config';
import { Api } from 'telegram/tl';
import { FloodWaitError } from 'telegram/errors';
import TgClientAuth from '../auth/main.auth';
import { markdownToChannels, delay } from '../utils/main.utils';

const storageChannel: string = config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME');

async function joinChannel(userClient: any, channel: string): Promise<'joined' | 'already' | 'failed'> {
  try {
    const peer = await userClient.getInputEntity(channel);
    await userClient.invoke(new Api.channels.JoinChannel({ channel: peer }));
    return 'joined';
  } catch (e: any) {
    if (e instanceof FloodWaitError) {
      console.log(`  FloodWait: waiting ${e.seconds}s...`);
      await delay(e.seconds * 1000);
      return joinChannel(userClient, channel);
    }
    if (String(e).includes('USER_ALREADY_PARTICIPANT')) return 'already';
    console.error(`  Failed to join ${channel}: ${e.message}`);
    return 'failed';
  }
}

async function main() {
  const userAuth = new TgClientAuth('USER');
  const userClient = await userAuth.start();

  // Read channel list from storage
  const peer = await userClient.getInputEntity(storageChannel);
  const history = await userClient.invoke(new Api.messages.GetHistory({ peer, limit: 1 }));
  const messages = (history as any).messages ?? [];

  if (!messages.length) {
    console.log('Storage channel is empty — nothing to subscribe.');
    await userClient.disconnect();
    return;
  }

  const channels = markdownToChannels(messages[0].message ?? '');
  console.log(`Found ${channels.length} channels in storage. Starting subscription...\n`);

  let joined = 0;
  let already = 0;
  let failed = 0;

  for (const ch of channels) {
    process.stdout.write(`[${joined + already + failed + 1}/${channels.length}] ${ch.name} ... `);
    const result = await joinChannel(userClient, ch.name);
    console.log(result);
    if (result === 'joined') joined++;
    else if (result === 'already') already++;
    else failed++;
    // Small delay between joins to avoid rate limits
    await delay(4000);
  }

  console.log(`\nDone. Joined: ${joined} | Already subscribed: ${already} | Failed: ${failed}`);

  await userClient.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
