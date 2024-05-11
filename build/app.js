"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const config_1 = __importDefault(require("config"));
const main_controller_1 = __importDefault(require("./controllers/main.controller"));
class App {
    bootstrap() {
        new main_controller_1.default(config_1.default).launch();
    }
}
exports.default = App;
