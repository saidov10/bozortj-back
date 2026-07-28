"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const shopController_1 = require("../controllers/shopController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/', shopController_1.getShops);
router.get('/:id', shopController_1.getShopById);
// Seller only settings
router.put('/settings/auto-reply', auth_1.authenticate, shopController_1.updateShopSettings);
exports.default = router;
