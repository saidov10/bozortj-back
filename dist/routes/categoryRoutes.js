"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categoryController_1 = require("../controllers/categoryController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Public / open routes
router.get('/', categoryController_1.getCategories);
router.get('/:categoryId/subcategories', categoryController_1.getSubcategories);
// Seller-only routes (add, edit, delete)
router.post('/', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), categoryController_1.createCategory);
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), categoryController_1.updateCategory);
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), categoryController_1.deleteCategory);
router.post('/:categoryId/subcategories', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), categoryController_1.createSubcategory);
router.put('/subcategories/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), categoryController_1.updateSubcategory);
router.delete('/subcategories/:id', auth_1.authenticate, (0, auth_1.authorize)(['SELLER']), categoryController_1.deleteSubcategory);
exports.default = router;
