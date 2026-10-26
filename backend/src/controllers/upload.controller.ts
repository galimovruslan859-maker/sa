import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { asyncHandler } from '../utils/async-handler';
import { badRequest } from '../utils/http-error';

const productsDir = path.join(env.uploadDir, 'products');
fs.mkdirSync(productsDir, { recursive: true });

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, productsDir),
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] ?? path.extname(file.originalname) ?? '.jpg';
    const base = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9а-яА-Я_-]+/g, '-')
      .slice(0, 40)
      .toLowerCase();
    cb(null, `${Date.now()}-${base || 'image'}${ext}`);
  },
});

export const uploadProductImages = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(badRequest('Разрешены только изображения (jpg, png, webp, gif, svg)'));
      return;
    }
    cb(null, true);
  },
}).array('images', 10);

/** POST /api/admin/uploads/products — загрузка фотографий товара. */
export const uploadProductsHandler = asyncHandler(async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw badRequest('Файлы не переданы (поле формы: images)');

  res.status(201).json({
    items: files.map((f, i) => ({
      url: `/uploads/products/${f.filename}`,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype,
      sortOrder: i,
    })),
  });
});

/** DELETE /api/admin/uploads — удалить загруженный файл. */
export const removeUpload = asyncHandler(async (req: Request, res: Response) => {
  const url = String(req.query.url ?? req.body?.url ?? '');
  const fileName = path.basename(url);
  if (!fileName || fileName.includes('..')) throw badRequest('Некорректное имя файла');

  const filePath = path.join(productsDir, fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true, removed: fileName });
});
