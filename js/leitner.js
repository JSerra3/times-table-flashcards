// Leitner scheduler for Times Table Flashcards.
// Pure functions: state in, new state out. Nothing here touches the page or storage,
// so the same module can run in the browser, in Node tests and (later) on the portal.
//
// Rules (from Joey, Nov 5 2026):
//  - 5 boxes. A card never seen starts in Box 1.
//  - The first answer to a card in a session moves it: right -> up one box (5 is the top),
//    wrong -> back to Box 1. A missed card comes back 3 to 5 cards later for a second try;
//    that retry is recorded but never moves the box.
//  - Session n draws Box 1 always, Box 2 when n % 2 == 0, Box 3 when n % 4 == 0,
//    Box 4 when n % 8 == 0, Box 5 when n % 16 == 0.
//  - At most 5 never-seen cards join a session, picked at random from the whole selection
//    (so choosing every table gives a mix, not all the 0s first). If too little is due,
//    the session is topped up with the lowest-box cards from the selection, but only to half
//    the chosen length: topping up all the way would show every card every session once the
//    selection is small, and known facts would stop coming up less often.

export const MAX_BOX = 5;
export const MAX_NEW = 5;
export const RECENT_LIMIT = 200;
export const FACTORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const key = (a, b) => `${a}x${b}`;
export const parseKey = k => k.split("x").map(Number);

export function dueBoxes(n) {
  const boxes = [1];
  if (n % 2 === 0) boxes.push(2);
  if (n % 4 === 0) boxes.push(3);
  if (n % 8 === 0) boxes.push(4);
  if (n % 16 === 0) boxes.push(5);
  return boxes;
}

// Every card in the chosen tables, in the order new cards are introduced:
// the lowest chosen table first, then by the other factor.
// Picking the 7s gives 7 x 0-12 and 0-12 x 7: 25 cards, since 7 x 7 is one card.
export function deckFor(tables) {
  const chosen = new Set(tables);
  const cards = [];
  for (const a of FACTORS) for (const b of FACTORS) {
    if (!chosen.has(a) && !chosen.has(b)) continue;
    const table = Math.min(...[a, b].filter(f => chosen.has(f)));
    const other = table === a ? b : a;
    cards.push({ k: key(a, b), table, other, a });
  }
  cards.sort((x, y) => x.table - y.table || x.other - y.other || x.a - y.a);
  return cards.map(c => c.k);
}

export const boxOf = (profile, k) => profile.cards[k]?.box ?? 1;
export const isNew = (profile, k) => !profile.cards[k];

function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Lowest box first; shuffled within a box.
const byBox = (profile, keys, rng) => {
  const s = shuffle(keys, rng);
  return s.map((k, i) => [boxOf(profile, k), i, k]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(x => x[2]);
};

export function newProfile(nickname, { id, now = Date.now() } = {}) {
  return {
    id: id ?? `p${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    nickname, createdAt: now, sessionCount: 0,
    settings: { tables: [], mode: "flip", length: 20 },
    cards: {}, recent: [],
  };
}

// Plan the next session. Returns { n, queue, pos, firsts, retried }.
export function planSession(profile, { tables, length = 20, maxNew = MAX_NEW, rng = Math.random } = {}) {
  const n = profile.sessionCount + 1;
  const deck = deckFor(tables ?? profile.settings.tables);
  const due = dueBoxes(n);
  const seen = deck.filter(k => !isNew(profile, k));
  const fresh = deck.filter(k => isNew(profile, k));

  const picked = byBox(profile, seen.filter(k => due.includes(boxOf(profile, k))), rng).slice(0, length);
  const newOnes = shuffle(fresh, rng).slice(0, Math.min(maxNew, length - picked.length));
  const queue = picked.concat(newOnes);
  const floor = Math.ceil(length / 2);
  if (queue.length < floor) {
    const inQueue = new Set(queue);
    queue.push(...byBox(profile, seen.filter(k => !inQueue.has(k)), rng).slice(0, floor - queue.length));
  }
  return { n, queue: shuffle(queue, rng), pos: 0, firsts: {}, retried: {} };
}

export const currentCard = s => s.queue[s.pos] ?? null;
export const isDone = s => s.pos >= s.queue.length;

// Record an answer to the current card. mode is "flip" (self-graded) or "type" (checked).
// Returns { profile, session, first } as new objects; the inputs are not changed.
export function answer(profile, session, { correct, mode, ms = null, at = Date.now(), rng = Math.random }) {
  const k = currentCard(session);
  if (!k) throw new Error("session is over");
  const first = !(k in session.firsts);
  const old = profile.cards[k];
  const boxBefore = old?.box ?? 1;
  const p = { ...profile, cards: { ...profile.cards }, sessionCount: Math.max(profile.sessionCount, session.n) };
  const s = { ...session, queue: session.queue.slice(), firsts: { ...session.firsts }, retried: { ...session.retried }, pos: session.pos + 1 };

  if (first) {
    const c = old ? { ...old } : { box: 1, lastSession: 0, seen: 0, right: 0, wrong: 0, flipRight: 0, flipWrong: 0, lastMs: null };
    c.box = correct ? Math.min(MAX_BOX, c.box + 1) : 1;
    c.lastSession = session.n;
    c.seen += 1;
    const field = (mode === "flip" ? "flip" : "") + (correct ? "Right" : "Wrong");
    c[field[0].toLowerCase() + field.slice(1)] += 1;
    c.lastMs = ms;
    p.cards[k] = c;
    s.firsts[k] = correct;
  }
  if (!correct && !s.retried[k]) {
    s.retried[k] = true;
    const at3to5 = session.pos + 1 + 3 + Math.floor(rng() * 3);
    s.queue.splice(Math.min(at3to5, s.queue.length), 0, k);
  }
  p.recent = profile.recent.concat({ fact: k, mode, correct, ms, box: boxBefore, at, ...(first ? {} : { retry: true }) })
    .slice(-RECENT_LIMIT);
  return { profile: p, session: s, first };
}

export function summary(session) {
  const nailed = [], practice = [];
  for (const [k, ok] of Object.entries(session.firsts)) (ok ? nailed : practice).push(k);
  const order = (x, y) => parseKey(x)[0] - parseKey(y)[0] || parseKey(x)[1] - parseKey(y)[1];
  return { nailed: nailed.sort(order), practice: practice.sort(order) };
}

// 0 = new, 1..5 = how well the student knows it (the box, never shown as a number).
export const level = (profile, k) => profile.cards[k]?.box ?? 0;
