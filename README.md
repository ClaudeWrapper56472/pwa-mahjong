# Jade Match

Mahjong solitaire, as an installable progressive web app.

No dependencies, no build step, no framework. Plain ES modules served as files.
The tile faces are drawn in SVG by the code that ships them, and the app icons
are drawn by a script, so there is no art file to keep in step.

## The rules

Tiles are stacked in layers. Tap two tiles with the same face to take them off
the board, and clear every tile to win.

A tile can only be taken when **nothing rests on top of it** and **its left or
right edge is clear**. Tiles you cannot take are dimmed. Flowers match any other
flower and seasons match any other season; they carry a coloured band along the
bottom edge — green for flowers, blue for seasons.

Six boards, opening in order as you clear them: **Opening** (38 tiles, one
layer) through **Turtle** and **Fortress**, both the full 144 tiles.

**Hint** points at a pair, and prefers one that leaves the board winnable.
Picking a tile does not show you where its match is; the menu has an option to
turn that on if you want the help.
**Shuffle** re-deals the tiles still in play without changing which tiles they
are, so it can dig you out of a dead board. **Undo** takes a pair back, as far
as the start of the board.

Double-tap a spot to zoom in on it and double-tap again to fit the whole board;
pinch or use the zoom buttons, and drag to move around.

**Keyboard:** arrows step through the free tiles, `Enter` takes one, `H` hints,
`S` shuffles, `F` fits the board, `+`/`-` zoom, `Cmd`/`Ctrl`+`Z` undoes, `Esc`
leaves.

## Running it

Modules and the service worker need a real origin, so open it over HTTP rather
than as a file:

```bash
cd ~/Sites/pwa-mahjong-blast
python3 -m http.server 8000
# then http://localhost:8000
```

Installing it from the browser's Add to Home Screen gives a standalone app that
plays offline.

```bash
node tests/verify.mjs        # 125 assertions over the game layer
node tools/make-icons.mjs    # redraws icons/, which are checked in
```

The self-check needs Node 18 or newer. It runs the whole game layer headlessly:
it proves every shipped board parses into legal geometry, and it replays the
order each deal was built from to prove the board it hands the player really
does come apart.

## Layout

```
index.html               The shell: both screens, shown and hidden
manifest.webmanifest     Installability: name, icons, standalone
sw.js                    Precaches everything; code network-first, art cache-first
css/style.css            Chrome, layout, and the tiles themselves

js/layouts/
  layout.js              Half-tile geometry: positions, covers, side neighbours
  catalog.js             The six boards, drawn in ASCII

js/tiles/
  tile-set.js            The 42 faces, the 144-tile deck, what matches what
  faces.js               Every face drawn in SVG, as one sprite sheet

js/commands/             Undo
  command.js             Base class
  match-command.js       Take one pair
  shuffle-command.js     Re-deal what is left
  undo-stack.js          The history, serialization, command factory

js/
  board-state.js         What is on the board and which tiles are free
  deal.js                Dealing, shuffling, and the solver behind the hint
  game-state.js          The running game, and every event the interface hears
  save-manager.js        The save document in localStorage, plus suspend hooks
  save-migration.js      Pure version-migration functions
  settings.js            Preferences
  util/emitter.js        Named events
  util/rng.js            Seeded PCG32
  ui/                    board-view.js, menu-screen.js, game-screen.js,
                         page-zoom.js, main.js

icons/                   App icons, drawn by tools/make-icons.mjs
tools/make-icons.mjs     PNG encoder and rasterizer, no dependencies
tests/verify.mjs         Self-check for the game layer
```

## How it works

**Coordinates are half tiles.** A tile at `(x, y)` covers the square
`[x, x+2) x [y, y+2)`, so a layer can offset a row by half a tile the way a paper
layout does, and the classic turtle's stray side tiles land where they should.
Layers stack in `z`, shifted up and left on screen, which is why a tile's drawn
thickness sits on its bottom and right edges.

**Boards are ASCII.** A layer is a list of rows and `[` marks a tile's top-left
corner, so `"[][][][]"` is four tiles side by side. Parsing refuses two tiles in
the same place and refuses a raised tile that is not fully carried by tiles
below, so a mistyped row fails loudly at startup rather than producing a board
with a tile floating over a hole.

**Every deal ships with a solution.** The deal is built by playing it: starting
from a full layout, two free positions are taken at a time and handed the next
pair from the deck, so the order they were dealt in is a way to clear the board.
One of the two always comes from the highest layer still standing, which keeps
the stacks peeling and stops the draw from ending with the last two tiles sat
one on top of the other. A shuffle does the same over the tiles still in play,
so it can only ever move faces to places that come apart again.

**Freeness is a counter, not a search.** Each position keeps a count of the live
tiles above it and to either side, and a removal adjusts the handful of
neighbours it touches. Asking whether a tile is free is then a comparison, which
is what makes the hint's random playouts cheap enough to run while the player
waits: a hint plays a few games to the end from each candidate pair and offers
one that can still be finished.

**The board is one transform.** Tiles are absolutely positioned in the layout's
own pixel space and `#board` is scaled and translated as a whole, so pinching a
144-tile board composites one element rather than relaying out 144. Hit testing
goes through `elementFromPoint`, which reads viewport coordinates and so needs no
arithmetic to undo that transform.

## Deliberate omissions

- **No accounts, ads, leaderboards, purchases or analytics.** Nothing leaves the
  device; the save document is the only thing written anywhere.
- **No sound, and no animation beyond a tile fading out.**
- **No timer pressure.** The clock records how long a board took and does
  nothing else.
- **No difficulty settings.** The board is the difficulty.
