import { Router } from 'express';
const router = Router();
router.get('/', (req, res) => res.json([]));
router.get('/:id', (req, res) => res.status(404).json({ error: 'Not implemented' }));
router.post('/', (req, res) => res.status(501).json({ error: 'Not implemented' }));
router.put('/:id', (req, res) => res.status(501).json({ error: 'Not implemented' }));
router.delete('/:id', (req, res) => res.status(501).json({ error: 'Not implemented' }));
export default router;
