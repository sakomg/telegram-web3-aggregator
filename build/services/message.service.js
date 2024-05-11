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
Object.defineProperty(exports, "__esModule", { value: true });
const tl_1 = require("telegram/tl");
const main_utils_1 = require("../utils/main.utils");
class MessageService {
    constructor(botClient, userClient) {
        this.botClient = botClient;
        this.userClient = userClient;
    }
    getMessagesHistory(channel, limit) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.userClient.invoke(new tl_1.Api.messages.GetHistory({
                peer: (0, main_utils_1.normalizeUsername)(channel),
                limit: limit,
            }));
            return result;
        });
    }
    forwardMessages(fromChannel, toChannel, messageIds) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.botClient.invoke(new tl_1.Api.messages.ForwardMessages({
                    id: messageIds,
                    fromPeer: (0, main_utils_1.normalizeUsername)(fromChannel),
                    toPeer: (0, main_utils_1.normalizeUsername)(toChannel),
                    dropMediaCaptions: false,
                }));
            }
            catch (e) {
                throw new Error(`Can't forward messages from ${fromChannel} to ${toChannel}. ` + e);
            }
        });
    }
}
exports.default = MessageService;
