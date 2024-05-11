"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("telegram/events");
const main_auth_1 = __importDefault(require("../auth/main.auth"));
const message_service_1 = __importDefault(require("../services/message.service"));
class MainController {
    constructor(config) {
        this.config = config;
        this.storageChannel = this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME');
    }
    launch() {
        return __awaiter(this, void 0, void 0, function* () {
            const botClientContainer = new main_auth_1.default(this.config, 'BOT');
            yield botClientContainer.start();
            const userClientContainer = new main_auth_1.default(this.config, 'USER');
            yield userClientContainer.start();
            const messageService = new message_service_1.default(botClientContainer.client, userClientContainer.client);
            botClientContainer.client.addEventHandler((event) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                if ((_a = event === null || event === void 0 ? void 0 : event.message) === null || _a === void 0 ? void 0 : _a.message) {
                    const messageWrapper = event.message;
                    const sender = yield messageWrapper.getSender();
                    const message = messageWrapper.message;
                    if (message.startsWith('/sub')) {
                        this.processSubscriptionChannel(botClientContainer.client, messageService, message, sender);
                    }
                    if (message.startsWith('/start')) {
                        setInterval(() => this.processStart(botClientContainer.client, messageService, sender), 10000);
                    }
                }
            }), new events_1.NewMessage({}));
        });
    }
    processSubscriptionChannel(client, messageService, message, sender) {
        return __awaiter(this, void 0, void 0, function* () {
            const channelName = message === null || message === void 0 ? void 0 : message.split(' ')[1];
            const storageChannelResult = yield messageService.getMessagesHistory(this.storageChannel, 1);
            const lastForwardedResult = storageChannelResult.messages[0];
            const scrapChannels = this.markdownToChannels(lastForwardedResult.message);
            let replyMessage = '';
            try {
                const entity = yield client.getEntity(channelName);
                if (entity.className === 'Channel') {
                    if (!scrapChannels.map((item) => item.name).includes(channelName)) {
                        scrapChannels.push({
                            name: channelName,
                            messageId: 0,
                        });
                        const markdown = this.channelsToMarkdown(scrapChannels);
                        client.sendMessage(this.storageChannel, { message: markdown, parseMode: 'markdown' });
                        replyMessage = `Channel <b>${channelName}</b> has been added to list.`;
                    }
                    else {
                        replyMessage = `<b>${channelName}</b> is already in the list.`;
                    }
                }
                else {
                    replyMessage = `Username <b>${channelName}</b> is of type <b>${entity.className}</b>. It must be channels only.`;
                }
            }
            catch (e) {
                replyMessage = `Channel <b>${channelName}</b> doesn't exist, check the username.`;
            }
            yield client.sendMessage(sender, { message: replyMessage, parseMode: 'html' });
        });
    }
    processStart(client, messageService, sender) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const storageChannelResult = yield messageService.getMessagesHistory(this.storageChannel, 1);
            if ((_a = storageChannelResult.messages) === null || _a === void 0 ? void 0 : _a.length) {
                let needToUpdate = false;
                const lastForwardedResult = storageChannelResult.messages[0];
                const scrapChannels = this.markdownToChannels(lastForwardedResult.message);
                for (const channel of scrapChannels) {
                    const result = yield messageService.getMessagesHistory(channel.name, 1);
                    const messageIds = result === null || result === void 0 ? void 0 : result.messages.map((item) => item.id).toSorted();
                    if (channel.messageId != messageIds[0]) {
                        needToUpdate = true;
                        channel.messageId = messageIds[0];
                        yield messageService.forwardMessages(channel.name, this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME'), messageIds);
                        client.sendMessage(sender, {
                            message: `Message ${messageIds[0]} has been forwarded from ${channel.name} at ${new Date().toLocaleString()}`,
                            parseMode: 'html',
                        });
                    }
                }
                if (needToUpdate) {
                    const markdown = this.channelsToMarkdown(scrapChannels);
                    client.editMessage(this.storageChannel, { message: lastForwardedResult.id, text: markdown });
                }
            }
            else {
                client.sendMessage(sender, {
                    message: 'Store channel is empty.',
                });
            }
        });
    }
    markdownToChannels(markdownContent) {
        const channels = [];
        const rows = markdownContent.trim().split('\n').slice(2);
        rows.forEach((row) => {
            const [name, messageId] = row
                .trim()
                .split('|')
                .slice(1, 3)
                .map((cell) => cell.trim());
            if (name && messageId) {
                channels.push({ name, messageId: parseInt(messageId) });
            }
        });
        return channels;
    }
    channelsToMarkdown(channels) {
        let markdown = '| Name | Message ID |\n';
        markdown += '| ---- | ---------- |\n';
        channels.forEach((channel) => {
            markdown += `| ${channel.name} | ${channel.messageId} |\n`;
        });
        return markdown;
    }
}
exports.default = MainController;
