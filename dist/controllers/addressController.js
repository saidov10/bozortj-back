"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDefaultAddress = exports.deleteAddress = exports.updateAddress = exports.createAddress = exports.getAddresses = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Get Addresses
const getAddresses = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const addresses = await prisma_1.default.address.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        return res.status(200).json({ addresses });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving addresses', error: error.message });
    }
};
exports.getAddresses = getAddresses;
// 2. Create Address
const createAddress = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        if (req.user.role !== 'BUYER')
            return res.status(403).json({ message: 'Only buyers can save addresses' });
        const { title, city, street, building, apartment, postalCode, landmark, isDefault } = req.body;
        if (!title || !city || !street || !building) {
            return res.status(400).json({ message: 'Title, city, street, and building are required' });
        }
        const defaultBool = isDefault === 'true' || isDefault === true;
        const newAddress = await prisma_1.default.$transaction(async (tx) => {
            if (defaultBool) {
                // Set all other user's addresses isDefault to false
                await tx.address.updateMany({
                    where: { userId: req.user.id },
                    data: { isDefault: false }
                });
            }
            return tx.address.create({
                data: {
                    userId: req.user.id,
                    title,
                    city,
                    street,
                    building,
                    apartment: apartment || null,
                    postalCode: postalCode || null,
                    landmark: landmark || null,
                    isDefault: defaultBool
                }
            });
        });
        return res.status(201).json({
            message: 'Address saved successfully',
            address: newAddress
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error creating address', error: error.message });
    }
};
exports.createAddress = createAddress;
// 3. Update Address
const updateAddress = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { id } = req.params;
        const { title, city, street, building, apartment, postalCode, landmark, isDefault } = req.body;
        const existingAddress = await prisma_1.default.address.findUnique({
            where: { id }
        });
        if (!existingAddress) {
            return res.status(404).json({ message: 'Address not found' });
        }
        if (existingAddress.userId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized access to address' });
        }
        const defaultBool = isDefault === 'true' || isDefault === true;
        const updatedAddress = await prisma_1.default.$transaction(async (tx) => {
            if (defaultBool) {
                await tx.address.updateMany({
                    where: { userId: req.user.id },
                    data: { isDefault: false }
                });
            }
            return tx.address.update({
                where: { id },
                data: {
                    title: title !== undefined ? title : existingAddress.title,
                    city: city !== undefined ? city : existingAddress.city,
                    street: street !== undefined ? street : existingAddress.street,
                    building: building !== undefined ? building : existingAddress.building,
                    apartment: apartment !== undefined ? apartment : existingAddress.apartment,
                    postalCode: postalCode !== undefined ? postalCode : existingAddress.postalCode,
                    landmark: landmark !== undefined ? landmark : existingAddress.landmark,
                    isDefault: defaultBool
                }
            });
        });
        return res.status(200).json({
            message: 'Address updated successfully',
            address: updatedAddress
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating address', error: error.message });
    }
};
exports.updateAddress = updateAddress;
// 4. Delete Address
const deleteAddress = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { id } = req.params;
        const existingAddress = await prisma_1.default.address.findUnique({
            where: { id }
        });
        if (!existingAddress) {
            return res.status(404).json({ message: 'Address not found' });
        }
        if (existingAddress.userId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized access to address' });
        }
        await prisma_1.default.address.delete({
            where: { id }
        });
        return res.status(200).json({ message: 'Address deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error deleting address', error: error.message });
    }
};
exports.deleteAddress = deleteAddress;
// 5. Set Default Address
const setDefaultAddress = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { id } = req.params;
        const existingAddress = await prisma_1.default.address.findUnique({
            where: { id }
        });
        if (!existingAddress) {
            return res.status(404).json({ message: 'Address not found' });
        }
        if (existingAddress.userId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized access to address' });
        }
        const updatedAddress = await prisma_1.default.$transaction(async (tx) => {
            await tx.address.updateMany({
                where: { userId: req.user.id },
                data: { isDefault: false }
            });
            return tx.address.update({
                where: { id },
                data: { isDefault: true }
            });
        });
        return res.status(200).json({
            message: 'Address set as default successfully',
            address: updatedAddress
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error setting default address', error: error.message });
    }
};
exports.setDefaultAddress = setDefaultAddress;
