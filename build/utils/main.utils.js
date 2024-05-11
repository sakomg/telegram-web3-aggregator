"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUsername = void 0;
function normalizeUsername(username) {
    if (username.startsWith('@'))
        return username;
    else
        return `@${username}`;
}
exports.normalizeUsername = normalizeUsername;
