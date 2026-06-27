import { Router } from 'express';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bookPath = join(__dirname, '..', 'data', 'book.json');
const bookData = JSON.parse(readFileSync(bookPath, 'utf8'));

const router = Router();
router.get('/', (_req, res) => res.json(bookData));
export default router;
