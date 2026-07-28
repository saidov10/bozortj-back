"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const colorController_1 = require("../controllers/colorController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Public read
router.get('/', colorController_1.getColors);
// Seller-only writes
router.post('/', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), colorController_1.createColor);
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), colorController_1.updateColor);
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), colorController_1.deleteColor);
exports.default = router;
