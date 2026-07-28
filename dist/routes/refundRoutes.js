"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const refundController_1 = require("../controllers/refundController");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Submit return request with images
router.post('/:id/refund', upload_1.uploadRefundImages, refundController_1.createRefundRequest);
// Process return request (Seller action)
router.put('/:id/refund', refundController_1.processRefundRequest);
// Dispute resolution (Admin action)
router.put('/:id/refund/dispute', refundController_1.resolveRefundDispute);
exports.default = router;
