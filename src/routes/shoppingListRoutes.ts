import { Router } from 'express';
import {
  getMyLists,
  createList,
  deleteList,
  addListItem,
  removeListItem,
  moveListToCart
} from '../controllers/shoppingListController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate, authorize(['BUYER']));

router.get('/', getMyLists);
router.post('/', createList);
router.delete('/:id', deleteList);
router.post('/:id/items', addListItem);
router.delete('/:id/items/:itemId', removeListItem);
router.post('/:id/move-to-cart', moveListToCart);

export default router;
