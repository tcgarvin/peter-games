# Porting a game into Peter's Arcade

Each pygame game becomes `games/<id>.js` + `art/<id>/` + `tests/<id>.test.js`. The shared shell
(`shell/`) runs it inside its cabinet: CRT screen, touchable painted controls, and the standard
lifecycle. Artillery (`games/artillery.js`, `art/artillery/`) is the worked example; read it first.

Open a game with `http://localhost:8765/?game=<id>` (server: `cd arcade && python3 -m http.server 8765 &`).

## What the shell does, so the game must not

- **Lifecycle.** ATTRACT (CPU vs CPU demo under a "press start" card) -> PLAYING <-> PAUSED ->
  GAME OVER -> PLAYING or ATTRACT. Start buttons, pause, quit, restart, and the title/pause/game
  over cards all belong to the shell. Drop the original's menus, "press R to restart", quit keys,
  mode-select screens and its own pause. If the original had options (difficulty, number of AI
  players, ...), pick sensible fixed values.
- **Input routing.** Keyboard, touch on the painted panel, gamepads and CPU players all arrive as
  the same per-player virtual stick + buttons.
- **Timing.** `update` is called at a fixed 60 Hz. Keep the original's per-frame constants and
  run one original frame per update; never use wall-clock time.

## The game module contract

```js
export const meta = {
  id: 'snake',            // = file name and art folder
  title: 'SNAKE',         // shown on the attract card, uppercase
  width: 800, height: 600, // the game's own canvas; the cabinet screen must have this aspect
  players: 2,             // 1 or 2 (default 2). 1-player games have no 2 PLAYER start button.
  // Either one map that follows the turn (turn-based games):
  //   keyboard: { shared: { up: [...], down, left, right, fire: [...] } }
  // or one per player (simultaneous games). A lone human gets the union of all maps, so
  // keep the original bindings (e.g. p1 WASD, p2 arrows) and both work in 1-player games.
  keyboard: { p1: { up: ['KeyW'], ..., fire: ['Space'] }, p2: { up: ['ArrowUp'], ..., fire: ['Enter'] } },
  // Twin-stick games may also bind aimUp/aimDown/aimLeft/aimRight (the second stick).
  keyHints: { p1: { stick: 'WASD', fire: 'SPACE' }, p2: { stick: 'ARROWS', fire: 'ENTER' } },
  // (or flat { stick: 'ARROWS', fire: 'SPACE' } when shared). Keys of keyHints are control names.
};

export function createGame({ bots }) // bots[i] is true when player i is a CPU
// returns an object with:
//   update(input)   one tick. input.player(i) is a PlayerInput (shell/controls.js):
//                     .x .y in [-1, 1], .pulseX .pulseY (-1/0/1 on press, then auto-repeat),
//                     .direction, .down(name), .pressed(name), .aim (second stick {x, y, ...})
//   draw(ctx)       draw the whole frame on a 2D context of meta.width x meta.height
//   botInput(i)     the CPU's controls for player i this tick: {x, y, buttons: {fire: bool, ...},
//                     aim?: {x, y}}. CPUs play THROUGH the virtual controls (the panel shows the
//                     CPU working its stick), never by poking game state. Throw if i is human.
//   over            true once the game has ended (the shell lets it run ~1 s more, then shows
//                     GAME OVER while update/draw keep going)
//   resultText      one short line for the GAME OVER card, e.g. 'PLAYER 2 WINS', 'SCORE 1200',
//                     'WAVE 7 REACHED'. Uppercase, at most ~20 characters.
//   activePlayer    (turn-based only) whose turn it is; the shared keyboard map drives them.
```

Controls and names:
- Every game has a primary button named `fire` (it also resumes from pause). The art may label it
  anything (FLAP, JUMP, SLICE, ATTACK). A second button is `fire2`. Gamepad A/B map to fire/fire2.
- Panel control ids: `p1_stick`, `p1_aim` (twin-stick only), `p1_fire`, `p1_fire2`, the same with
  `p2_`, plus `start_1p` and (2-player games) `start_2p`. Leave out what the game doesn't use
  (Flappy needs no stick).
- A CPU is required for every player slot: attract mode is CPU vs CPU, and 1-player mode of a
  2-player game is human vs CPU. Reuse the original's AI where there is one. Bots should be
  decent but beatable, and must not stall the game forever in attract mode (the demo should end
  or be clearly progressing within a few minutes).
- For a 1-player game, attract mode is the CPU playing it.

Code style: plain ES modules, no dependencies, no build step. Match `games/artillery.js`:
constants at the top, classes per entity, the "Press Start 2P" font for HUD text
(`'"Press Start 2P", monospace'`). Keep the look of the original (colours, shapes); improve only
what's needed to read well through the CRT at phone size (thicker lines, bigger HUD text). Fix
obvious bugs in the original and mention them in a comment. Very large resolutions (e.g.
1728x1080, 1200x1200) may be reduced if it keeps the gameplay identical (scale the drawing, not the
physics), since the screen is drawn small anyway.

## Tests (`tests/<id>.test.js`, run with `npm test`)

At least: CPU vs CPU (or the CPU alone) finishes, or makes progress, within a bounded number of
ticks with sensible `resultText`; and one or two tests of core rules driven through
`PlayerInput.apply` (see `tests/artillery.test.js`). `draw` isn't tested (no canvas in node).

## Cabinet art with Codex

Run Codex with write access to the game's art folder, and tell it in the brief the exact file
names to save under `src/` (the names `slice.json` uses):

```
codex exec -s workspace-write --skip-git-repo-check -C art/<id> - < brief.txt
```

(The sandbox needs bubblewrap to create user namespaces; on Ubuntu 24.04 that takes a one-time
`sudo tools/allow-bwrap-userns.sh`.) If an image isn't where you asked, Codex's copies are in
`~/.codex/generated_images/<session-id>/` (the session id is in Codex's output). Image generation
takes several minutes; run it in the background and wait for it.

Write the brief by adapting `art/artillery/BRIEF.md` (it worked very well) and save the exact text
you used as `art/<id>/BRIEF.md`. Per game:
- Describe the game and its look so Codex can design a cabinet that belongs to it; give Codex
  free rein on the theme, but spell out every control, its label, and which player it belongs to.
  Each game should have its own distinct cabinet and panel design.
- The screen's aspect ratio must equal meta.width:meta.height (a vertical monitor is fine for a
  tall game). Tell Codex the exact ratio.
- Ask only for the edit images the panel needs: stick UP/DOWN/LEFT/RIGHT edits if there are
  sticks (all sticks on the panel tilt together), and one "all buttons pressed" edit.
- Ask for both PORTRAIT (1024x1536) and LANDSCAPE (1536x1024) compositions.
- A 1-player game has one set of controls and one START button.

Then write `art/<id>/slice.json` (see `art/artillery/slice.json` and the docstring of
`tools/slice_cabinet.py`; add `"screen_aspect": [w, h]` to each layout) by looking at the base
images for the control positions, and run:

```
uv run --script tools/slice_cabinet.py art/<id>/slice.json
```

It fails loudly if a control didn't change between base and edit, or if the screen point isn't on
the dark screen. Check that every control got a sensible patch size in its output. If Codex's
edits changed things they shouldn't have (whole panel redrawn), regenerate that edit rather than
accepting a huge patch. If the art is unusable, regenerate; don't paper over it in the shell.

Delete the unused drafts. Commit-sized output: the WebP base images + WebP sprites + manifest
should stay around 3 MB. `src/` holds the full-size originals; it is git-ignored (too big for the
repo), so back it up: zip every `art/*/src/` and attach it to a new GitHub release, e.g.
`gh release create art-originals-<date> art-originals.zip`. The latest such release has
everything needed to re-slice any cabinet.

## Checking it

```
uv run --script tools/screenshot.py <id> <out-dir>
```

takes phone-portrait, phone-landscape and desktop shots (desktop starts a 1-player game and holds
right + Space). Look at every screenshot: the screen must sit exactly in the cabinet's screen,
controls must be visible and not cut off, the game must be readable. It exits 1 on console errors.

## Boundaries

Several games are ported at once by different people. Only create or change files under
`games/<id>.js`, `art/<id>/`, and `tests/<id>.test.js`. Do not edit `shell/`, `tools/`,
`index.html` or other games. If the shell can't do something the game needs, stop and report what
is missing and why rather than working around it.

## The lobby cabinet

The lobby shows every game's whole cabinet standing on the arcade floor with its attract mode
playing on the screen. Once the game and its cabinet art are done (this step edits
`games/registry.js`, so do it after the port is merged, or leave it to whoever merges):

1. Add the game to `games/registry.js`.
2. Copy `art/snake/FLOOR_BRIEF.md` to `art/<id>/FLOOR_BRIEF.md` with the title and screen
   aspect changed, and have Codex draw the full cabinet from the portrait base:
   `codex exec -s workspace-write --skip-git-repo-check -C art/<id> -i art/<id>/src/portrait-base.png - < art/<id>/FLOOR_BRIEF.md`
3. `uv run --script tools/make_floor.py art/<id>` (keys out the magenta, finds the screen,
   writes `floor.webp` + `floor.json`).
4. With the server running, `uv run --script tools/record_attract.py <id>` (writes
   `attract.webp`, a 4 s loop of the CPU demo under the title and a blinking INSERT COIN).
5. `uv run --script tools/screenshot.py lobby <out-dir>` and look at it.
