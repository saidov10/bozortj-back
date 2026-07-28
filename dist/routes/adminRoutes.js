"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminController_1 = require("../controllers/adminController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Buyer submits a report
router.post('/reports', (0, auth_1.authorize)(['BUYER']), adminController_1.createReport);
// Admin-only moderation endpoints
router.get('/reports', (0, auth_1.authorize)(['ADMIN']), adminController_1.getReports);
router.put('/reports/:id', (0, auth_1.authorize)(['ADMIN']), adminController_1.updateReportStatus);
router.put('/users/:userId/block', (0, auth_1.authorize)(['ADMIN']), adminController_1.toggleUserBlock);
router.get('/users', (0, auth_1.authorize)(['ADMIN']), adminController_1.getUsers);
exports.default = router;
