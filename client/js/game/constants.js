export const EMPTY = 0, W_MAN = 1, B_MAN = -1, W_KING = 2, B_KING = -2;
export const MODE_PVP = 0, MODE_PVA = 1, MODE_MVH = 2, MODE_AVA = 3, MODE_SANDBOX = 4;

export function getPieceIdx(p) {
  return p === W_MAN ? 0 : p === B_MAN ? 1 : p === W_KING ? 2 : 3;
}

export function idx2Str(i) {
  return String.fromCharCode(97 + (i & 7)) + ((i >> 3) + 1);
}

export function move2Str(m) {
  let s = idx2Str(m.from);
  if (m.captured.length > 0) for (const p of m.path) s += 'x' + idx2Str(p);
  else s += '-' + idx2Str(m.to);
  return s;
}

export function moveSorter(a, b) {
  const sa = a.captured.length * 100 + (a.capKings || 0) * 10 + (a.promo ? 50 : 0);
  const sb = b.captured.length * 100 + (b.capKings || 0) * 10 + (b.promo ? 50 : 0);
  if (sa !== sb) return sb - sa;
  return (a.from * 64 + a.to) - (b.from * 64 + b.to);
}
