import { Router } from 'express';
import {
  createRegistry,
  getMyRegistries,
  getRegistryByCode,
  addRegistryItem,
  removeRegistryItem,
  markRegistryItemPurchased
} from '../controllers/registryController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Owner-managed registries
router.post('/', authenticate, createRegistry);
router.get('/mine', authenticate, getMyRegistries);
router.post('/:id/items', authenticate, addRegistryItem);
router.delete('/:id/items/:itemId', authenticate, removeRegistryItem);

// Public shareable view + guest "mark purchased"
router.get('/:shareCode', getRegistryByCode);
router.post('/:shareCode/items/:itemId/purchase', markRegistryItemPurchased);

export default router;
