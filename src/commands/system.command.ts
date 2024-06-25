import os from 'node:os';
import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';

const emoji = {
  CPU: '⚙️',
  MEMORY: '🖥️',
  HOSTNAME: '🏠',
  PLATFORM: '🔧',
  RELEASE: '📆',
  ARCHITECTURE: '🔩',
  USER: '👤',
};

export class SystemCommand implements CommandHandler {
  constructor() {}

  async handle(botClient: TelegramClient, sender: any, message: string) {
    console.log(`💥 /system handler`);
    await botClient.sendMessage(sender, { message: this.getSystemInfo(), parseMode: 'html' });
  }

  getSystemInfo() {
    const totalMemoryMB = this.bytesToMB(os.totalmem());
    const freeMemoryMB = this.bytesToMB(os.freemem());
    const usedMemoryMB = totalMemoryMB - freeMemoryMB;

    const systemInfo = `
      ${emoji.CPU} CPU Usage: ${this.getCpuUsage()}%
      ${emoji.MEMORY} Memory:
          Total: ${totalMemoryMB.toFixed(2)} MB
          Free : ${freeMemoryMB.toFixed(2)} MB
          Used : ${usedMemoryMB.toFixed(2)} MB
      ${emoji.HOSTNAME} Hostname: ${os.hostname()}
      ${emoji.PLATFORM} Platform: ${os.platform()}
      ${emoji.RELEASE} Release : ${os.release()}
      ${emoji.ARCHITECTURE} Architecture: ${os.arch()}
      ${emoji.USER} User: ${os.userInfo().username}
  `;

    return systemInfo;
  }

  getCpuUsage() {
    const cpus: any[] = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;

    const percentageCPU = 100 - ~~((100 * idle) / total);
    return percentageCPU;
  }

  bytesToMB(bytes: number) {
    return bytes / (1024 * 1024);
  }
}
