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
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const readline_1 = __importDefault(require("readline"));
const WHO_TO_SESSION = {
    BOT: 'TELEGRAM_BOT_SESSION',
    USER: 'TELEGRAM_USER_SESSION',
};
class TgClientAuth {
    constructor(config, who) {
        this.config = config;
        this.who = who;
        const session = new sessions_1.StringSession(process.env[WHO_TO_SESSION[this.who]]);
        this.tgClient = new telegram_1.TelegramClient(session, Number(process.env.TELEGRAM_API_ID), process.env.TELEGRAM_API_HASH, {
            connectionRetries: 5,
        });
    }
    get client() {
        return this.tgClient;
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.who == 'BOT') {
                yield this.startAsBot(process.env.TELEGRAM_TOKEN);
            }
            else if (this.who == 'USER') {
                yield this.startAsUser(process.env.TELEGRAM_USER_PHONE);
            }
        });
    }
    startAsUser(phoneNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const rl = readline_1.default.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            try {
                yield this.tgClient.start({
                    phoneNumber: phoneNumber,
                    password: () => __awaiter(this, void 0, void 0, function* () { return new Promise((resolve) => rl.question('>>> Please enter your password: ', resolve)); }),
                    phoneCode: () => __awaiter(this, void 0, void 0, function* () { return new Promise((resolve) => rl.question('>>> Please enter the code you received: ', resolve)); }),
                    onError: (err) => console.log(err),
                });
            }
            catch (e) {
                throw new Error('error login as user: ' + e);
            }
        });
    }
    startAsBot(telegramToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.tgClient.start({
                    botAuthToken: telegramToken,
                });
            }
            catch (e) {
                throw new Error('error login as bot: ' + e);
            }
        });
    }
}
exports.default = TgClientAuth;
