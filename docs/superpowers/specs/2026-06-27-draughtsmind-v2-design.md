# DraughtsMind v2 — Design Spec

Feature-complete port of monolith v31.0.0 with clean architecture.

## v2 Features (from monolith)

### Game Modes (5 total)
- PvP (0) — Player vs Player local
- PvA (1) — Player vs AI (human plays white)
- MVH (2) — AI vs Human (human plays black, board auto-flips)
- AvA (3) — AI vs AI (no white bias in eval)
- Sandbox (4) — Free play, no rules enforcement

### Clock System
- Per-side countdown timers (configurable: 0=unlimited, 1-60 minutes)
- Clock tick every 250ms
- Warning state at ≤30 seconds
- Timeout detection → auto-loss
- Time display in MM:SS format
- Clock deducts thinking time from AI moves

### Analysis Toggle
- Checkbox in sidebar to enable/disable real-time analysis
- When ON: shows depth, eval, nodes, time, PV on every human turn
- When OFF: only shows info after CPU moves
- Analysis runs via `runAna()` — full search (not book probe)

### Board Flip
- Selector (W/B) to flip board perspective
- Auto-flips when MVH mode selected
- Coordinates update correctly when flipped
- CSS transform rotate(180deg) on board

### Save/Load
- Save button: POST + PUT to server
- Load button: GET matches list, resume selected
- Both callbacks properly wired from main.js

### PDN Import
- Text input modal for PDN notation
- Parses move strings, replays game
- Validates moves against legal moves

### Eval Bias
- +4 cp for human games (PvP, PvA, MVH)
- 0 cp for AvA mode (pure engine evaluation)

## v2 Architecture Improvements

### Game State Manager
- Extract gameState ownership from board.js into dedicated `gameState.js`
- Board.js becomes pure rendering (no state ownership)
- main.js manages state through gameState.js

### Dead Code Cleanup
- Remove unused `selectSquare`, `findMoveTo` from board.js (main.js handles selection directly)
- Remove unused `setFlipped` from board.js (main.js manages flip state)

### Piece Count + CPU Stats
- Display material count (white: X pieces, black: Y pieces)
- AvA mode: track wins/draws/losses across games

### Tests
- Unit tests for State class (init, clone, getMoves, applyMove, checkDraw)
- Unit tests for evaluate()
- Unit tests for move utilities

## Files Modified

| File | Changes |
|------|---------|
| `client/js/game/constants.js` | Add MVH, SANDBOX modes |
| `client/js/game/state.js` | No changes (already complete) |
| `client/js/game/eval.js` | Conditional bias based on mode param |
| `client/js/ui/board.js` | Remove state ownership, pure rendering |
| `client/js/ui/controls.js` | Add clock, analysis toggle, view selector, piece count |
| `client/js/main.js` | Major rework: clock, analysis, PDN import, state manager |
| `client/index.html` | Add clock elements, analysis checkbox, view selector, PDN import button |
| `client/css/style.css` | Clock styles, analysis toggle styles |
| `server/routes/matches.js` | Add 'mvh' and 'sandbox' to mode validation |
