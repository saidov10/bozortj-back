"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatController_1 = require("../controllers/chatController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Restricted to BUYER and SELLER (Admins don't participate in seller-buyer chats)
router.use(auth_1.authenticate, (0, auth_1.authorize)(['BUYER', 'SELLER']));
router.get('/conversations', chatController_1.getConversations);
router.get('/history/:partnerId', chatController_1.getMessageHistory);
exports.default = router;
