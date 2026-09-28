import 'dotenv/config';
import config from 'config';
import TgClientAuth from '../auth/main.auth';
import { MessageService, StorageService } from '../services';
import { delay } from '../utils/main.utils';

async function main() {
  const userClient = await new TgClientAuth('USER').start();
  // Only user-side calls are made here, so the user client stands in for the bot one
  const messageService = new MessageService(userClient, userClient);
  const channels = await new StorageService(messageService, config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME')).load();

  if (!channels?.length) {
    console.log('Storage channel is empty — nothing to subscribe.');
    await userClient.disconnect();
    return;
  }

  console.log(`Found ${channels.length} channels in storage. Starting subscription...\n`);
  const counts = { joined: 0, already: 0, failed: 0 };

  for (const [i, ch] of channels.entries()) {
    process.stdout.write(`[${i + 1}/${channels.length}] ${ch.name} ... `);
    try {
      await messageService.joinChannel(ch.name);
      counts.joined++;
      console.log('joined');
    } catch (e: any) {
      if (String(e).includes('USER_ALREADY_PARTICIPANT')) {
        counts.already++;
        console.log('already');
      } else {
        counts.failed++;
        console.log(`failed: ${e.message}`);
      }
    }
    await delay(4000);
  }

  console.log(`\nDone. Joined: ${counts.joined} | Already subscribed: ${counts.already} | Failed: ${counts.failed}`);
  await userClient.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
