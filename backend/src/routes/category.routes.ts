import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import { optionalAuth } from '../middleware/auth';

const router = Router();

router.use(optionalAuth);
router.get('/', categoryController.list);

export default router;
