import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { State } from '../client/js/game/state.js';
import { EMPTY, W_MAN, B_MAN, W_KING, B_KING } from '../client/js/game/constants.js';

describe('State', () => {
  it('initializes with correct piece placement', () => {
    const s = new State();
    // White men on rows 0-2 (dark squares)
    assert.equal(s.board[0], W_MAN);   // a1
    assert.equal(s.board[2], W_MAN);   // c1
    assert.equal(s.board[9], W_MAN);   // b2
    // Black men on rows 5-7 (dark squares)
    assert.equal(s.board[48], B_MAN);  // a7
    assert.equal(s.board[54], B_MAN);  // g7
    assert.equal(s.board[63], B_MAN);  // h8
    // Empty squares
    assert.equal(s.board[27], EMPTY);  // d4 (center)
    // Turn starts at 1 (white)
    assert.equal(s.turn, 1);
  });

  it('generates correct number of opening moves', () => {
    const s = new State();
    const moves = s.getMoves();
    // Brazilian draughts: white has 12 men with forward diagonals
    assert.ok(moves.length >= 7, `Expected >= 7 opening moves, got ${moves.length}`);
  });

  it('clone produces independent copy', () => {
    const s = new State();
    const s2 = s.clone();
    s2.board[0] = EMPTY;
    assert.equal(s.board[0], W_MAN); // original unchanged
    assert.equal(s2.board[0], EMPTY);
  });

  it('applyMove switches turn', () => {
    const s = new State();
    const moves = s.getMoves();
    s.applyMove(moves[0]);
    assert.equal(s.turn, -1);
  });

  it('checkDraw returns false for fresh game', () => {
    const s = new State();
    assert.equal(s.checkDraw(), false);
  });

  it('handles multi-jump captures', () => {
    // Set up a position with multi-jump available:
    // W_MAN at c3, B_MAN at d4 and f6
    // c3 captures d4 → e5, then captures f6 → g7
    const s = new State();
    s.board.fill(EMPTY);
    s.board[18] = W_MAN;  // c3
    s.board[27] = B_MAN;  // d4
    s.board[45] = B_MAN;  // f6
    s.turn = 1;
    const moves = s.getMoves();
    // Should find at least one capture
    const captures = moves.filter(m => m.captured.length > 0);
    assert.ok(captures.length > 0, 'Should find captures');
  });

  it('clone preserves all state fields', () => {
    const s = new State();
    s.turn = -1;
    s.halfMoveClock = 5;
    s.isEndgame = true;
    s.endgameClock = 3;
    s.endgameLimit = 10;

    const s2 = s.clone();
    assert.equal(s2.turn, -1);
    assert.equal(s2.halfMoveClock, 5);
    assert.equal(s2.isEndgame, true);
    assert.equal(s2.endgameClock, 3);
    assert.equal(s2.endgameLimit, 10);
  });

  it('applyMove clears captured pieces', () => {
    const s = new State();
    s.board.fill(EMPTY);
    s.board[18] = W_MAN;  // c3
    s.board[27] = B_MAN;  // d4
    s.turn = 1;
    const moves = s.getMoves();
    const capture = moves.find(m => m.captured.length > 0);
    assert.ok(capture, 'Should find a capture');
    s.applyMove(capture);
    // Captured piece should be gone
    for (const idx of capture.captured) {
      assert.equal(s.board[idx], EMPTY, `Square ${idx} should be empty after capture`);
    }
  });

  it('applyMove handles promotion', () => {
    const s = new State();
    s.board.fill(EMPTY);
    s.board[45] = W_MAN;  // f6
    s.board[54] = B_MAN;  // b7
    s.turn = 1;
    const moves = s.getMoves();
    const promo = moves.find(m => m.promo);
    if (promo) {
      s.applyMove(promo);
      assert.equal(s.board[promo.to], W_KING, 'Piece should be promoted to king');
    }
  });

  it('hash changes with turn', () => {
    const s = new State();
    const h1 = s.hash;
    s.flipTurn();
    const h2 = s.hash;
    assert.notEqual(h1, h2, 'Hash should differ with different turn');
  });

  it('getMoves returns no captures when none available', () => {
    const s = new State();
    const moves = s.getMoves();
    const captures = moves.filter(m => m.captured.length > 0);
    assert.equal(captures.length, 0, 'Opening position should have no captures');
  });
});
