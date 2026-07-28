"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productController_1 = require("../controllers/productController");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const validation_1 = require("../middleware/validation");
const router = (0, express_1.Router)();
// Public routes
router.get('/', productController_1.getProducts);
router.get('/:id', productController_1.getProductById);
// Seller only routes
router.post('/', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), upload_1.uploadProductImages, validation_1.productValidator, productController_1.createProduct);
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), upload_1.uploadProductImages, productController_1.updateProduct);
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), productController_1.deleteProduct);
// Reply to review (Seller only)
router.post('/reviews/:id/reply', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), productController_1.replyToReview);
// Buyer only routes (Allows uploading multiple review photos)
router.post('/:id/reviews', auth_1.authenticate, (0, auth_1.authorize)(['BUYER']), upload_1.uploadReviewImages, validation_1.reviewValidator, productController_1.addReview);
exports.default = router;
