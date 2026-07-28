"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cartController_1 = require("../controllers/cartController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Apply auth and buyer restrictions to all cart routes
router.use(auth_1.authenticate, (0, auth_1.authorize)(['BUYER']));
router.get('/', cartController_1.getCart);
router.post('/', cartController_1.addToCart);
router.put('/:id', cartController_1.updateCartItem);
router.delete('/:id', cartController_1.removeFromCart);
exports.default = router;
