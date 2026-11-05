# Times Table Flashcards

Times-table flashcards from 0 × 0 to 12 × 12 (169 cards; 7 × 8 and 8 × 7 are separate) for
[Everyone Loves Math](https://www.everyonelovesmath.com/apps/). Facts a student misses come up
more often and facts they know come up less (the Leitner system). No login: progress is saved
in the browser, per nickname.

Served by the site at `everyonelovesmath.com/apps/times-table-flashcards/` (the site's
`build.py` pulls this repo's `main` on every build). A plain static app: HTML, CSS and ES
modules, no build step.

## Files

- `js/leitner.js`: the scheduler. Pure functions (state in, new state out), no page or storage code.
- `js/app.js`: the screens, saving to `localStorage` (key `elm-times-table-flashcards`), keyboard.
- `css/app.css`, `assets/`: the ELM Notebook house style, copied from the site's `src/assets`.
- `tests/leitner.test.mjs`: unit tests and many-session simulations. Run `npm test` (Node 20+).

## Rules

- 5 boxes; a new card starts in Box 1. The first answer to a card in a session moves it:
  right goes up one box (5 is the top), wrong goes back to Box 1.
- A missed card comes back 3 to 5 cards later for a second try. The retry is recorded but
  doesn't move the box.
- Session *n* draws Box 1 always, Box 2 when *n* is a multiple of 2, Box 3 of 4, Box 4 of 8,
  Box 5 of 16.
- Never-seen cards join a session at random from all the chosen tables: at most 5 for one or
  two tables, growing to 10 when every table is picked (about one per 16 cards in the selection).
  New cards with an 11 or 12 come in sparingly (a tenth as likely) until the lower cards in
  the selection reach Box 3; if only 11s and 12s are chosen, they come in normally. If fewer cards than
  half the session length are due, it's topped up with the lowest-box cards.
- Box 1–2 fronts show the fact and a dot array with no numbers; Box 3–5 show the fact only.
  The back is the same for every box. **Students never see a box number.**
- Only right or wrong moves a card. Time per answer is saved for later.

## Saved data

```
{ version: 1, current, profiles: { <id>: { id, nickname, createdAt, sessionCount, settings: { tables, mode, length },
    cards: { "7x8": { box, lastSession, seen, right, wrong, flipRight, flipWrong, lastMs } },
    recent: [ { fact, mode, correct, ms, box, at, retry? } ] } } }
```

`right`/`wrong` count typed (checked) answers and `flipRight`/`flipWrong` self-graded ones,
first answers only. `recent` keeps the last 200 attempts, retries included. Nothing leaves
the browser.

## Updating

The site serves `/apps/*` with `Cache-Control: max-age=0, must-revalidate`, so browsers check
for a new version on every visit. The `?v=3` on `css/app.css`, `js/app.js` and the
`leitner.js` import was a one-time bump to push phones off a copy cached before that rule.

## Testing in the browser

Serve the folder (`python3 -m http.server`; modules don't load from `file://`), then in the
console: `__ttf.demo("12x12", 2, "type")` shows one card in a given box and mode.
