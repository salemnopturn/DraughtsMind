import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// List all matches
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const matches = db.prepare('SELECT * FROM matches ORDER BY created_at DESC').all();
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single match
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    const state = db.prepare('SELECT * FROM game_states WHERE match_id = ?').get(req.params.id);
    res.json({ ...match, state: state || null });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new match
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { mode } = req.body;
    if (!['pvp', 'pva', 'mvh', 'ava', 'sandbox'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Must be pvp, pva, mvh, ava, or sandbox.' });
    }
    const result = db.prepare('INSERT INTO matches (mode) VALUES (?)').run(mode);
    db.prepare(
      'INSERT INTO game_states (match_id, board, turn, history, mode) VALUES (?, ?, ?, ?, ?)'
    ).run(result.lastInsertRowid, '[]', 1, '[]', mode);
    res.json({ id: result.lastInsertRowid, mode });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update match (save state or finalize)
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const match = db.prepare('SELECT id FROM matches WHERE id = ?').get(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    const { board, turn, history, pdn, result } = req.body;

    if (result) {
      // Game ended — finalize match, remove in-progress state
      db.prepare('UPDATE matches SET result = ?, pdn = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(result, pdn || null, req.params.id);
      db.prepare('DELETE FROM game_states WHERE match_id = ?').run(req.params.id);
    } else {
      // In-progress — upsert state
      db.prepare('UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
      db.prepare(
        'INSERT OR REPLACE INTO game_states (match_id, board, turn, history, mode) VALUES (?, ?, ?, ?, ?)'
      ).run(req.params.id, JSON.stringify(board), turn, JSON.stringify(history), req.body.mode);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete match
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM game_states WHERE match_id = ?').run(req.params.id);
    db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
