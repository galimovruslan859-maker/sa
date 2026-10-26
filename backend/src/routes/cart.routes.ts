import { Router } from 'express';
import * as cartController from '../controllers/cart.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', cartController.getCart);
router.post('/', cartController.addItem);
router.put('/:id', cartController.updateItem);
router.delete('/:id', cartController.removeItem);
router.delete('/', cartController.clear);

export default router;
