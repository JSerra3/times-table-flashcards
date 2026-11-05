// Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../js/leitner.js";

// Small seeded RNG so simulations are repeatable.
const seeded = (seed = 1) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test("deck: 0x0 to 12x12 is 169 cards, and the 7s are 25", () => {
  assert.equal(L.deckFor(L.FACTORS).length, 169);
  const sevens = L.deckFor([7]);
  assert.equal(sevens.length, 25);
  assert.ok(sevens.includes("7x8") && sevens.includes("8x7") && sevens.includes("7x0") && sevens.includes("0x7"));
  assert.equal(new Set(sevens).size, 25);
});

test("deck: lower chosen tables come first", () => {
  const d = L.deckFor([8, 3]);
  const firstEight = d.findIndex(k => !L.parseKey(k).includes(3));
  assert.ok(d.slice(0, firstEight).every(k => L.parseKey(k).includes(3)));
  assert.equal(d.length, 25 + 25 - 2); // 3x8 and 8x3 are shared
});

test("due boxes follow the session number", () => {
  assert.deepEqual(L.dueBoxes(1), [1]);
  assert.deepEqual(L.dueBoxes(2), [1, 2]);
  assert.deepEqual(L.dueBoxes(4), [1, 2, 3]);
  assert.deepEqual(L.dueBoxes(8), [1, 2, 3, 4]);
  assert.deepEqual(L.dueBoxes(16), [1, 2, 3, 4, 5]);
  assert.deepEqual(L.dueBoxes(6), [1, 2]);
});

test("first session brings in at most 5 new cards", () => {
  const p = L.newProfile("Sam", { id: "x", now: 0 });
  const s = L.planSession(p, { tables: [7], length: 20, rng: seeded() });
  assert.equal(s.queue.length, 5);
  assert.equal(s.n, 1);
});

test("right moves up one box, wrong goes back to box 1, box 5 is the top", () => {
  let p = L.newProfile("Sam", { id: "x", now: 0 });
  p.cards["7x8"] = { box: 5, lastSession: 0, seen: 4, right: 4, wrong: 0, flipRight: 0, flipWrong: 0, lastMs: 1 };
  p.cards["2x2"] = { box: 3, lastSession: 0, seen: 2, right: 2, wrong: 0, flipRight: 0, flipWrong: 0, lastMs: 1 };
  let s = { n: 1, queue: ["7x8", "2x2", "3x3"], pos: 0, firsts: {}, retried: {} };
  ({ profile: p, session: s } = L.answer(p, s, { correct: true, mode: "type", rng: seeded() }));
  assert.equal(p.cards["7x8"].box, 5);
  ({ profile: p, session: s } = L.answer(p, s, { correct: false, mode: "flip", rng: seeded() }));
  assert.equal(p.cards["2x2"].box, 1);
  assert.equal(p.cards["2x2"].flipWrong, 1);
  ({ profile: p, session: s } = L.answer(p, s, { correct: true, mode: "flip", rng: seeded() }));
  assert.equal(p.cards["3x3"].box, 2);
  assert.equal(p.cards["3x3"].flipRight, 1);
  assert.equal(p.cards["7x8"].right, 5);
  assert.equal(p.sessionCount, 1);
});

test("a missed card comes back 3 to 5 cards later, and the retry doesn't move its box", () => {
  for (let seed = 1; seed < 40; seed++) {
    const rng = seeded(seed);
    let p = L.newProfile("Sam", { id: "x", now: 0 });
    let s = { n: 1, queue: ["1x1", "1x2", "1x3", "1x4", "1x5", "1x6", "1x7", "1x8"], pos: 0, firsts: {}, retried: {} };
    ({ profile: p, session: s } = L.answer(p, s, { correct: false, mode: "type", rng }));
    const back = s.queue.indexOf("1x1", 1);
    assert.ok(back >= 4 && back <= 6, `retry at ${back}`); // 3 to 5 cards after the next one shown
    while (L.currentCard(s) !== "1x1") ({ profile: p, session: s } = L.answer(p, s, { correct: true, mode: "type", rng }));
    const r = L.answer(p, s, { correct: true, mode: "type", rng });
    assert.equal(r.first, false);
    assert.equal(r.profile.cards["1x1"].box, 1);
    assert.equal(r.profile.cards["1x1"].seen, 1);
    assert.equal(r.profile.recent.at(-1).retry, true);
  }
});

test("a card missed twice gets only one retry", () => {
  let p = L.newProfile("Sam", { id: "x", now: 0 });
  let s = { n: 1, queue: ["1x1"], pos: 0, firsts: {}, retried: {} };
  ({ profile: p, session: s } = L.answer(p, s, { correct: false, mode: "type" }));
  assert.deepEqual(s.queue, ["1x1", "1x1"]);
  ({ profile: p, session: s } = L.answer(p, s, { correct: false, mode: "type" }));
  assert.ok(L.isDone(s));
});

test("answer doesn't change its inputs", () => {
  const p = L.newProfile("Sam", { id: "x", now: 0 });
  const s = { n: 1, queue: ["1x1", "2x2"], pos: 0, firsts: {}, retried: {} };
  const pj = JSON.stringify(p), sj = JSON.stringify(s);
  L.answer(p, s, { correct: false, mode: "flip" });
  assert.equal(JSON.stringify(p), pj);
  assert.equal(JSON.stringify(s), sj);
});

test("an empty session is filled with the lowest-box cards", () => {
  const p = L.newProfile("Sam", { id: "x", now: 0 });
  p.sessionCount = 2; // session 3: only box 1 is due
  for (const k of L.deckFor([2])) p.cards[k] = { box: k === "2x5" ? 2 : 3, lastSession: 2, seen: 3, right: 3, wrong: 0, flipRight: 0, flipWrong: 0, lastMs: 1 };
  const s = L.planSession(p, { tables: [2], length: 10, rng: seeded() });
  assert.equal(s.queue.length, 5); // topped up to half the chosen length
  assert.ok(s.queue.includes("2x5")); // the lowest box goes in first
});

test("recent keeps the last 200 attempts", () => {
  let p = L.newProfile("Sam", { id: "x", now: 0 });
  for (let i = 0; i < 260; i++) {
    const s = { n: i + 1, queue: ["3x3"], pos: 0, firsts: {}, retried: {} };
    p = L.answer(p, s, { correct: true, mode: "type", at: i }).profile;
  }
  assert.equal(p.recent.length, 200);
  assert.equal(p.recent.at(-1).at, 259);
});

// A student who knows a fact once it has been seen a few times: over many sessions
// every card should be introduced and climb, and nothing should go out of range.
function simulate({ tables, sessions, length, skill, seed }) {
  const rng = seeded(seed);
  let p = L.newProfile("Sim", { id: "s", now: 0 });
  for (let i = 0; i < sessions; i++) {
    let s = L.planSession(p, { tables, length, rng });
    assert.ok(s.queue.length <= length);
    assert.equal(new Set(s.queue).size, s.queue.length, "no card twice in a planned session");
    const newCount = s.queue.filter(k => L.isNew(p, k)).length;
    assert.ok(newCount <= L.MAX_NEW);
    let guard = 0;
    while (!L.isDone(s)) {
      const k = L.currentCard(s);
      const c = p.cards[k];
      const correct = rng() < skill(c ? c.seen : 0);
      ({ profile: p, session: s } = L.answer(p, s, { correct, mode: rng() < 0.5 ? "flip" : "type", ms: 1000, rng }));
      assert.ok(++guard < length * 3);
    }
    for (const c of Object.values(p.cards)) assert.ok(c.box >= 1 && c.box <= 5);
    assert.equal(p.sessionCount, i + 1);
  }
  return p;
}

test("simulation: a steady learner masters the 7s and 8s", () => {
  const p = simulate({ tables: [7, 8], sessions: 120, length: 20, skill: seen => Math.min(0.95, 0.4 + seen * 0.15), seed: 7 });
  const deck = L.deckFor([7, 8]);
  assert.ok(deck.every(k => p.cards[k]), "every card introduced");
  const high = deck.filter(k => p.cards[k].box >= 4).length;
  assert.ok(high / deck.length > 0.7, `${high} of ${deck.length} in box 4-5`);
});

test("simulation: the whole deck, a struggling learner, short sessions", () => {
  const p = simulate({ tables: L.FACTORS, sessions: 200, length: 10, skill: () => 0.5, seed: 3 });
  assert.ok(Object.keys(p.cards).length > 40);
  assert.ok(p.recent.length <= 200);
});

test("simulation: missed facts come up more often than known ones", () => {
  // Over 64 sessions, a fact always missed is shown far more than a fact always known.
  const rng = seeded(11);
  let p = L.newProfile("Sim", { id: "s", now: 0 });
  const shown = {};
  for (let i = 0; i < 64; i++) {
    let s = L.planSession(p, { tables: [6], length: 10, rng });
    while (!L.isDone(s)) {
      const k = L.currentCard(s);
      if (!(k in s.firsts)) shown[k] = (shown[k] || 0) + 1;
      ({ profile: p, session: s } = L.answer(p, s, { correct: k !== "6x7", mode: "type", rng }));
    }
  }
  assert.ok(shown["6x7"] > 3 * shown["6x8"], `6x7 ${shown["6x7"]}, 6x8 ${shown["6x8"]}`);
});
