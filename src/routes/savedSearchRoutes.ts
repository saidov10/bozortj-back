import { Router } from 'express';
import {
  createSavedSearch,
  getSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  getSavedSearchResults
} from '../controllers/savedSearchController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate, authorize(['BUYER']));

router.get('/', getSavedSearches);
router.post('/', createSavedSearch);
router.get('/:id/results', getSavedSearchResults);
router.patch('/:id', updateSavedSearch);
router.delete('/:id', deleteSavedSearch);

export default router;
