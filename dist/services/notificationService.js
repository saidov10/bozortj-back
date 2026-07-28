"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const chatSocket_1 = require("./chatSocket");
// Helper to create notifications in database and broadcast live
const createNotification = async (userId, title, content) => {
    try {
        await prisma_1.default.notification.create({
            data: { userId, title, content }
        });
        // Broadcast live to socket room
        (0, chatSocket_1.sendLiveNotification)(userId, title, content);
    }
    catch (err) {
        console.error('Failed to create notification record:', err);
    }
};
exports.createNotification = createNotification;
