"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const validation_1 = require("../middleware/validation");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
// Routes
router.post('/register/buyer', upload_1.uploadAvatar, validation_1.registerBuyerValidator, authController_1.registerBuyer);
router.post('/register/seller', upload_1.uploadAvatar, validation_1.registerSellerValidator, authController_1.registerSeller);
router.post('/login', validation_1.loginValidator, authController_1.login);
router.get('/me', auth_1.authenticate, authController_1.getProfile);
router.put('/me', auth_1.authenticate, upload_1.uploadAvatar, authController_1.updateProfile);
exports.default = router;
