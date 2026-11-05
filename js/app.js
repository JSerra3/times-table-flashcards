// Times Table Flashcards: the page. The Leitner rules live in leitner.js; this file
// draws the screens, saves to this browser and wires up finger, mouse and keyboard.
import * as L from "./leitner.js?v=6";

const KEY = "elm-times-table-flashcards";
const VERSION = 1;
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
// Phones and tablets get an on-page number pad instead of the system keyboard: the iPhone
// number pad has no Enter key, so typing there took type, ✓, then Check.
const touch = matchMedia("(pointer: coarse)");

// ---------------------------------------------------------------- saving
let storageOk = true;
function load() {
  try {
    localStorage.setItem(KEY + "-test", "1");
    localStorage.removeItem(KEY + "-test");
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && raw.version === VERSION && raw.profiles) return raw;
  } catch { storageOk = false; }
  return { version: VERSION, profiles: {}, current: null };
}
let db = load();
function save() {
  if (!storageOk) return;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { storageOk = false; }
  $("storage-note").hidden = storageOk;
}

const me = () => db.profiles[db.current] ?? null;
function setMe(p) { db.profiles[p.id] = p; save(); }

// ---------------------------------------------------------------- helpers
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
};
const times = (a, b) => `${a} × ${b}`;
const rowsOf = (a, b) => `${a} ${a === 1 ? "row" : "rows"} of ${b}`;
const STATUS = ["new", "just started", "learning", "getting there", "almost there", "mastered"];

function whichText(tables) {
  const t = tables.slice().sort((x, y) => x - y);
  if (t.length === 13) return "all of them";
  const names = t.map(n => `${n}s`);
  return "the " + (names.length > 1 ? names.slice(0, -1).join(", ") + " & " + names.at(-1) : names[0] ?? "");
}

function show(id) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== id;
  window.scrollTo(0, 0);
}

function syncPills(root = document) {
  const p = me();
  for (const g of root.querySelectorAll(".pills[data-setting]")) {
    const v = String(p?.settings[g.dataset.setting] ?? "");
    for (const b of g.querySelectorAll(".pill")) b.setAttribute("aria-pressed", String(b.dataset.value === v));
  }
}

// The big fact, e.g. 7 × 8 (or 7 × 8 = when typing).
function factEl(a, b, { eq = false, product = null } = {}) {
  return el("p", { class: "fact" },
    el("span", { class: "a", text: a }), " ", el("span", { class: "x", text: "×" }), " ", el("span", { class: "b", text: b }),
    eq || product != null ? [" ", el("span", { class: "eq", text: "=" })] : null,
    product != null ? [" ", el("span", { class: "p", text: product })] : null);
}

// Shrink a line until it fits its box (12 × 12 on a phone).
function fit(node, maxW, fs) {
  node.style.fontSize = fs + "px";
  for (let i = 0; i < 4 && node.scrollWidth > maxW && fs > 24; i++) {
    fs = Math.floor(fs * maxW / node.scrollWidth) - 1;
    node.style.fontSize = fs + "px";
  }
}

// The array: one dot per unit, a rows of b. With labels (the back) it adds the running
// totals down the right and along the bottom; the last of each is the product, in the same plain style (Joey, Nov 5).
function arrayEl(a, b, { labels, maxW, maxH, maxCell }) {
  const labW = labels ? 44 : 0, labH = labels ? 28 : 0;
  const cell = Math.max(8, Math.floor(Math.min((maxW - labW) / b, (maxH - labH) / a, maxCell)));
  const dot = Math.max(5, cell - Math.max(3, Math.round(cell * 0.16)));
  // labels can be 3 digits (up to 132), so they shrink to fit a cell
  const lab = Math.max(8, Math.min(14, Math.floor((cell - 2) / 1.85)));
  const g = el("div", {
    class: "arr",
    style: { gridTemplateColumns: `repeat(${b}, ${cell}px)` + (labels ? " auto" : ""), "--cell": cell + "px", "--dot": dot + "px", "--lab": lab + "px" },
  });
  g.style.setProperty("--cell", cell + "px"); g.style.setProperty("--dot", dot + "px"); g.style.setProperty("--lab", lab + "px");
  for (let r = 1; r <= a; r++) {
    for (let c = 1; c <= b; c++) g.append(el("i"));
    if (labels) g.append(el("b", { class: "r", text: r * b }));
  }
  if (labels) {
    for (let c = 1; c <= b; c++) g.append(el("b", { class: "c", text: c * a }));
    g.append(el("b"));
  }
  return g;
}

// ---------------------------------------------------------------- start screen
function renderStart() {
  const box = $("profiles");
  box.replaceChildren();
  const list = Object.values(db.profiles).sort((x, y) => x.createdAt - y.createdAt);
  for (const p of list) box.append(el("button", {
    class: "prof", type: "button", "aria-pressed": String(p.id === db.current), text: p.nickname,
    onclick: () => { db.current = p.id; save(); renderStart(); },
  }));
  if (!list.length) box.append(el("p", { class: "hand hint", text: "Add a nickname to start. It stays on this device." }));

  const p = me();
  const picks = $("table-picks");
  picks.replaceChildren();
  for (const n of L.FACTORS) picks.append(el("button", {
    class: "tbl", type: "button", "aria-pressed": String(!!p?.settings.tables.includes(n)), "aria-label": `the ${n}s`, text: n, disabled: !p,
    onclick: () => {
      const t = new Set(me().settings.tables);
      t.has(n) ? t.delete(n) : t.add(n);
      me().settings.tables = [...t].sort((x, y) => x - y); save(); renderStart();
    },
  }));
  const tables = p?.settings.tables ?? [];
  $("table-hint").textContent = !p ? "" : tables.length ? `${whichText(tables)}: ${L.deckFor(tables).length} cards` : "pick at least one table";
  for (const id of ["all", "none", "to-progress"]) $(id).disabled = !p;
  $("go").disabled = !p || !tables.length;
  syncPills();
}

$("add-form").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("nick").value.trim().slice(0, 20);
  if (!name) return $("nick").focus();
  const p = L.newProfile(name);
  db.profiles[p.id] = p; db.current = p.id; save();
  $("nick").value = "";
  renderStart();
});
$("all").onclick = () => { me().settings.tables = L.FACTORS.slice(); save(); renderStart(); };
$("none").onclick = () => { me().settings.tables = []; save(); renderStart(); };
for (const g of document.querySelectorAll(".pills[data-setting]")) g.addEventListener("click", e => {
  const b = e.target.closest(".pill"); const p = me();
  if (!b || !p) return;
  const k = g.dataset.setting;
  p.settings[k] = k === "length" ? Number(b.dataset.value) : b.dataset.value;
  save(); syncPills();
  if (g.closest("#play") && view?.kind === "front") renderFront();
});
$("go").onclick = startSession;
$("to-progress").onclick = () => showProgress("start");

// ---------------------------------------------------------------- a session
let session = null, view = null, shownAt = 0, busy = false;

function startSession() {
  const p = me();
  if (!p || !p.settings.tables.length) return;
  session = L.planSession(p, { tables: p.settings.tables, length: p.settings.length });
  $("which").textContent = whichText(p.settings.tables);
  show("play"); syncPills();
  if (!session.queue.length) return endSession();
  nextCard();
}

function nextCard() {
  busy = false;
  if (L.isDone(session)) return endSession();
  shownAt = performance.now();
  view = { kind: "front" };
  renderFront();
}

const stage = () => $("stage");
const counter = () => { $("count").textContent = `Card ${Math.min(session.pos + 1, session.queue.length)} of ${session.queue.length}`; };
const innerWidth = node => { const cs = getComputedStyle(node); return node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); };

function renderFront() {
  const k = L.currentCard(session);
  const [a, b] = L.parseKey(k);
  const visual = L.boxOf(me(), k) <= 2;
  const typing = me().settings.mode === "type";
  const digits = String(a).length + String(b).length;
  counter();

  const pad = typing && touch.matches;
  const go = typing
    ? el("button", { class: "btn big", type: "button", text: "Check", onclick: check })
    : el("button", { class: "btn big", type: "button", id: "flip", text: "Flip it", onclick: flip });
  $("actions").replaceChildren(...(pad ? [keypad(), go] : [go])); // first, so the room left for the card is known

  const card = el("div", { class: `index ${visual ? "visual" : "plain"}${typing ? " typing" : ""}${pad ? " padded" : ""}` }, el("div", { class: "tape" }));
  stage().replaceChildren(card);
  const w = innerWidth(card);
  const phone = innerWidth(stage()) < 560;
  const input = typing ? el("input", { class: "answer", id: "answer", type: "text", inputmode: pad ? "none" : "numeric", pattern: "[0-9]*", autocomplete: "off", placeholder: "?", readonly: pad, "aria-label": `${times(a, b)} equals` }) : null;
  input?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); check(); } });

  let fact;
  if (visual) {
    if (typing) {
      fact = factEl(a, b, { eq: true });
      const row = el("div", { class: "inline-ans" }, fact, input);
      card.append(row);
      fit(fact, w - (phone ? 128 : 168), [80, 72, 64][digits - 2]);
    } else {
      fact = factEl(a, b);
      card.append(fact);
      fit(fact, w, [88, 80, 72][digits - 2]);
    }
    if (a > 0 && b > 0) {
      // The array is the star: it gets all the height the card has left on screen.
      const maxH = Math.max(120, roomLeft(card));
      const arr = arrayEl(a, b, { labels: false, maxW: w - 4, maxH, maxCell: 64 });
      arr.setAttribute("role", "img"); arr.setAttribute("aria-label", `${rowsOf(a, b)} dots`);
      card.append(arr);
    } else card.append(el("div", { class: "empty", role: "img", "aria-label": `${rowsOf(a, b)} dots` }));
  } else {
    fact = factEl(a, b, { eq: typing });
    card.append(fact);
    fit(fact, w, typing ? [116, 102, 90][digits - 2] : [140, 124, 108][digits - 2]);
    if (typing) card.append(el("div", { class: "under-ans" }, el("label", { for: "answer", text: "your answer" }), input));
    else card.append(el("p", { class: "say", text: "say it in your head, then flip!" }));
  }
  fact.setAttribute("aria-label", times(a, b).replace("×", "times"));
  if (!pad) (input ?? go).focus({ preventScroll: true });
}

// The on-page number pad: die-cut keys in a phone layout, with the Check arrow beside it.
function press(key) {
  const input = $("answer");
  if (!input || busy || view?.kind !== "front") return;
  if (key === "⌫") input.value = input.value.slice(0, -1);
  else if (input.value.length < 3) input.value += key;
}
function keypad() {
  // laid out like a phone's keypad: 1 2 3 / 4 5 6 / 7 8 9 / _ 0 ⌫
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return el("div", { class: "keypad", role: "group", "aria-label": "Number pad" },
    keys.map(k => k === "" ? el("span", { "aria-hidden": "true" }) : el("button", { type: "button", class: "key" + (k === "⌫" ? " del" : ""), text: k, "aria-label": k === "⌫" ? "delete" : k,
      onpointerdown: e => e.preventDefault(), onclick: () => press(k) })));
}

function turn(draw) {
  if (reduceMotion.matches) return draw();
  stage().classList.add("turning");
  setTimeout(() => { draw(); setTimeout(() => stage().classList.remove("turning"), 20); }, 160);
}

// How much taller a card can grow before it overflows the stage (measured with nothing in it
// but its fact, so the array can take the rest).
function roomLeft(card) {
  card.style.minHeight = "0";
  const room = stage().clientHeight - card.offsetHeight - 16;
  card.style.minHeight = "";
  return room;
}

function renderBack(buttons) {
  if (buttons) $("actions").replaceChildren(...buttons); // first, so the room left for the sheet is known
  const k = view.k ?? L.currentCard(session);
  const [a, b] = L.parseKey(k);
  const sheet = el("div", { class: "leaf f2 back", tabindex: "-1" }, el("div", { class: "tape t2" }));
  const head = el("div", { class: "back-head" }, factEl(a, b, { product: a * b }),
    el("p", { class: "rows-of" }, el("span", { class: "hl", text: rowsOf(a, b) })));
  sheet.append(head);
  if (view.wrote != null) sheet.append(el("p", { class: "wrote", text: `you wrote ${view.wrote}` }));
  if (view.correct) sheet.append(el("div", { class: "yes", role: "status", text: "Yes!" }));
  const body = el("div", { class: "back-body" });
  sheet.append(body);
  stage().replaceChildren(sheet);
  fit(head.firstChild, innerWidth(sheet), innerWidth(stage()) < 560 ? 42 : 58);
  if (a > 0 && b > 0) {
    const maxH = Math.max(140, roomLeft(sheet));
    const arr = arrayEl(a, b, { labels: true, maxW: innerWidth(sheet), maxH, maxCell: 64 });
    arr.setAttribute("role", "img");
    arr.setAttribute("aria-label", `${rowsOf(a, b)} dots, ${a * b} in all`);
    body.append(arr);
  } else {
    body.append(el("div", { class: "zero" }, el("p", { class: "big-hand", text: rowsOf(a, b) }),
      el("p", { text: "Nothing to count, so the answer is 0." })));
  }
  sheet.focus({ preventScroll: true });
}

function flip() {
  if (busy || view?.kind !== "front") return;
  view = { kind: "back", k: L.currentCard(session), ms: Math.round(performance.now() - shownAt) };
  turn(() => {
    renderBack([
      el("button", { class: "btn btn--paper big", type: "button", text: "Not yet", onclick: () => grade(false) }),
      el("button", { class: "btn big", type: "button", text: "Got it", onclick: () => grade(true) })]);
  });
}

function record(correct, mode, ms) {
  const r = L.answer(me(), session, { correct, mode, ms });
  setMe(r.profile);
  session = r.session;
}

function grade(correct) {
  if (busy || view?.kind !== "back" || view.typed) return;
  busy = true;
  record(correct, "flip", view.ms);
  nextCard();
}

function check() {
  if (busy || view?.kind !== "front") return;
  const input = $("answer");
  const text = input.value.trim();
  if (!/^\d+$/.test(text)) { input.value = ""; input.focus(); return; }
  const k = L.currentCard(session);
  const [a, b] = L.parseKey(k);
  const ms = Math.round(performance.now() - shownAt);
  const correct = Number(text) === a * b;
  busy = true;
  record(correct, "type", ms);
  // Right or wrong, a typed answer turns the card over to the back's labeled array.
  view = { kind: "back", k, typed: true, correct, wrote: correct ? null : text };
  turn(() => {
    const next = el("button", { class: "btn big", type: "button", text: "Next", onclick: () => { if (view.kind === "back") nextCard(); } });
    renderBack([next]);
    busy = false;
    next.focus({ preventScroll: true });
  });
}

$("stop").onclick = () => (session && Object.keys(session.firsts).length ? endSession() : home());

// ---------------------------------------------------------------- end of a session
function endSession() {
  view = null;
  const { nailed, practice } = L.summary(session);
  const item = k => { const [a, b] = L.parseKey(k); return el("li", { text: `${times(a, b)} = ${a * b}` }); };
  $("nailed").replaceChildren(...(nailed.length ? nailed.map(item) : [el("li", { class: "none", text: "none yet this time" })]));
  $("practice").replaceChildren(...(practice.length ? practice.map(item) : [el("li", { class: "none", text: "nothing! every one right" })]));
  $("end-who").textContent = me()?.nickname ?? "";
  show("end");
  $("again").focus({ preventScroll: true });
}
$("again").onclick = startSession;
$("end-home").onclick = home;
$("end-progress").onclick = () => showProgress("end");

function home() { session = null; view = null; renderStart(); show("start"); }

// ---------------------------------------------------------------- progress
let progressFrom = "start";
function showProgress(from) {
  const p = me();
  if (!p) return;
  progressFrom = from;
  $("prog-who").textContent = p.nickname;
  const t = $("tt");
  t.querySelectorAll("tr").forEach(r => r.remove());
  const headRow = el("tr", {}, el("th", { class: "corner-x", scope: "col", "aria-label": "rows times columns", text: "×" }), L.FACTORS.map(b => el("th", { scope: "col", text: b })));
  t.append(el("thead", {}, headRow));
  const body = el("tbody");
  for (const a of L.FACTORS) {
    body.append(el("tr", {}, el("th", { scope: "row", text: a }), L.FACTORS.map(b => {
      const k = L.key(a, b), lv = L.level(p, k);
      return el("td", {}, el("button", { type: "button", class: `l${lv}`, "aria-pressed": "false", "aria-label": `${times(a, b)}: ${STATUS[lv]}`, "data-k": k }));
    })));
  }
  t.append(body);
  $("detail").replaceChildren(el("p", { class: "said-text", text: "Tap a square to see how that fact is going." }));
  show("progress");
}
$("tt").addEventListener("click", e => {
  const btn = e.target.closest("button[data-k]");
  if (!btn) return;
  $("tt").querySelectorAll('[aria-pressed="true"]').forEach(x => x.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", "true");
  const p = me(), k = btn.dataset.k, [a, b] = L.parseKey(k), c = p.cards[k], lv = L.level(p, k);
  const kids = [factEl(a, b, { product: c ? a * b : null }), el("p", { class: "status" }, el("span", { class: "hl", text: STATUS[lv] }))];
  if (c) {
    const right = c.right + c.flipRight, wrong = c.wrong + c.flipWrong;
    kids.push(el("p", { class: "stats", text: `Seen ${c.seen} ${c.seen === 1 ? "time" : "times"}: ${right} right, ${wrong} not yet.` }));
    const tries = p.recent.filter(r => r.fact === k).slice(-6).reverse();
    if (tries.length) kids.push(el("ul", {}, tries.map(r => el("li", {
      text: `${r.correct ? "✓ right" : "✗ not yet"} · ${r.mode === "type" ? "typed" : "flipped"}${r.retry ? " · second try" : ""} · ${new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    }))));
  } else kids.push(el("p", { class: "stats", text: "Not practiced yet." }));
  $("detail").replaceChildren(...kids);
});
$("prog-back").onclick = () => (progressFrom === "end" ? show("end") : home());
$("forget").onclick = () => {
  const p = me();
  if (!p || !confirm(`Forget ${p.nickname} and all of their progress on this device?`)) return;
  delete db.profiles[p.id];
  db.current = Object.keys(db.profiles)[0] ?? null;
  save(); home();
};

// ---------------------------------------------------------------- keyboard
document.addEventListener("keydown", e => {
  if ($("play").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const onControl = e.target.closest?.("button, input");
  // A hardware keyboard still works with the on-page pad (an iPad with a keyboard).
  if (view?.kind === "front" && document.querySelector(".keypad") && !e.target.closest?.("input:not([readonly])")) {
    if (/^\d$/.test(e.key)) { e.preventDefault(); return press(e.key); }
    if (e.key === "Backspace") { e.preventDefault(); return press("⌫"); }
    if (e.key === "Enter" && !onControl) { e.preventDefault(); return check(); }
  }
  if (view?.kind === "front" && e.key === " " && !onControl) { e.preventDefault(); flip(); }
  else if (view?.kind === "back" && !view.typed) {
    if (e.key === "ArrowLeft") { e.preventDefault(); grade(false); }
    else if (e.key === "ArrowRight") { e.preventDefault(); grade(true); }
    else if (e.key === " " && !onControl) e.preventDefault();
  } else if (view?.kind === "back" && view.typed && !onControl && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) {
    e.preventDefault(); nextCard();
  }
});

// Redraw the card to fit when the window changes size.
let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if ($("play").hidden || !view || busy) return;
    if (view.kind === "front") {
      const typed = $("answer")?.value;
      renderFront();
      if (typed && $("answer")) $("answer").value = typed;
    } else renderBack();
  }, 120);
});

// ---------------------------------------------------------------- go
if (!db.current || !db.profiles[db.current]) db.current = Object.keys(db.profiles)[0] ?? null;
$("storage-note").hidden = storageOk;
// Wait for the fonts so the handwriting doesn't jump, but never more than a second.
let started = false;
const begin = () => { if (started) return; started = true; renderStart(); show("start"); };
document.fonts.ready.then(begin);
setTimeout(begin, 1000);
// If the fonts arrive after a card is drawn, draw it again so it fits.
document.fonts.addEventListener("loadingdone", () => dispatchEvent(new Event("resize")));

// For testing in the browser console: __ttf.setBox("7x8", 4)
window.__ttf = { L, get db() { return db; }, setBox(k, box) { const p = me(); p.cards[k] = { ...(p.cards[k] ?? { lastSession: 0, seen: 1, right: 0, wrong: 0, flipRight: 0, flipWrong: 0, lastMs: null }), box }; save(); },
  // Show one card: __ttf.demo("7x8", 2, "flip")
  demo(k, box, mode) { this.setBox(k, box); if (mode) me().settings.mode = mode; session = { n: 1, queue: [k], pos: 0, firsts: {}, retried: {} };
    $("which").textContent = whichText(me().settings.tables); show("play"); syncPills(); nextCard(); },
  flip: () => flip(), check: () => check() };
