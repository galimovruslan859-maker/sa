import { Router } from 'express';
import * as productController from '../controllers/product.controller';
import { optionalAuth } from '../middleware/auth';

const router = Router();

router.use(optionalAuth);

router.get('/', productController.list);
router.get('/facets', productController.facets);
router.get('/new', productController.newest);
// Статичные маршруты объявлены раньше /:id, чтобы «facets» и «new» не считались id
router.get('/:id', productController.detail);
router.get('/:id/reviews', productController.reviews);

export default router;
