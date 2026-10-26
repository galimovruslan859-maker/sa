import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import * as uploadController from '../controllers/upload.controller';
import { requireAdmin, requireAuth } from '../middleware/auth';

const router = Router();

// Все админские маршруты требуют JWT и роли ADMIN
router.use(requireAuth, requireAdmin);

// --- аналитика ---
router.get('/statistics', adminController.statistics);
router.get('/statistics/stock', adminController.stock);
router.get('/profit', adminController.profit);

// --- товары ---
router.get('/products', adminController.products);
router.post('/products', adminController.createProductAdmin);
router.get('/products/:id', adminController.productDetail);
router.put('/products/:id', adminController.updateProductAdmin);
router.delete('/products/:id', adminController.removeProduct);
router.put('/products/:id/stock', adminController.updateStockBulk);
router.put('/products/:id/variants/:variantId/stock', adminController.updateStock);

// --- категории ---
router.get('/categories', adminController.categories);
router.post('/categories', adminController.createCategory);
router.put('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.removeCategory);

// --- заказы ---
router.get('/orders', adminController.orders);
router.get('/orders/:id', adminController.orderDetail);
router.put('/orders/:id/status', adminController.updateOrderStatus);

// --- пользователи ---
router.get('/users', adminController.users);
router.put('/users/:id', adminController.updateUser);

// --- промокоды ---
router.get('/promocodes', adminController.promocodes);
router.post('/promocodes', adminController.createPromocodeAdmin);
router.put('/promocodes/:id', adminController.updatePromocodeAdmin);
router.delete('/promocodes/:id', adminController.removePromocode);

// --- расходы ---
router.get('/expenses', adminController.expenses);
router.post('/expenses', adminController.createExpense);
router.delete('/expenses/:id', adminController.removeExpense);

// --- поставщики и закупки ---
router.get('/suppliers', adminController.suppliers);
router.post('/suppliers', adminController.createSupplier);
router.delete('/suppliers/:id', adminController.removeSupplier);
router.get('/purchases', adminController.purchases);
router.post('/purchases', adminController.createPurchase);
router.put('/purchases/:id/status', adminController.updatePurchaseStatus);

// --- загрузка фотографий ---
router.post(
  '/uploads/products',
  uploadController.uploadProductImages,
  uploadController.uploadProductsHandler,
);
router.delete('/uploads', uploadController.removeUpload);

export default router;
