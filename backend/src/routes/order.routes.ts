import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/delivery-options', orderController.deliveryOptions);
router.get('/checkout-preview', orderController.checkoutPreview);
router.get('/', orderController.listMine);
router.post('/', orderController.create);
router.get('/:id', orderController.detail);
router.put('/:id/status', orderController.updateStatus);

export default router;
