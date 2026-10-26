import { Router } from 'express';
import * as reviewController from '../controllers/review.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/mine', reviewController.mine);
router.post('/', reviewController.create);
router.delete('/:id', reviewController.remove);

export default router;
