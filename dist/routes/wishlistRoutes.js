"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const wishlistController_1 = require("../controllers/wishlistController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Apply auth and buyer restrictions to all wishlist routes
router.use(auth_1.authenticate, (0, auth_1.authorize)(['BUYER']));
router.get('/', wishlistController_1.getWishlist);
router.post('/', wishlistController_1.addToWishlist);
router.delete('/:id', wishlistController_1.removeFromWishlist);
exports.default = router;
