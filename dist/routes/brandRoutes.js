"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const brandController_1 = require("../controllers/brandController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Public read
router.get('/', brandController_1.getBrands);
// Seller-only writes
router.post('/', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), brandController_1.createBrand);
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), brandController_1.updateBrand);
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), brandController_1.deleteBrand);
exports.default = router;
