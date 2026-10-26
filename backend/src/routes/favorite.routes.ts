import { Router } from 'express';
import * as favoriteController from '../controllers/favorite.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', favoriteController.list);
router.get('/ids', favoriteController.ids);
router.post('/', favoriteController.toggle);
router.post('/:productId', favoriteController.toggle);
router.delete('/:productId', favoriteController.remove);

export default router;
