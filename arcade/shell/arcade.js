// Runs one game inside its cabinet with the standard arcade lifecycle:
//   ATTRACT (CPU demo, "press start") -> PLAYING <-> PAUSED -> GAME OVER -> PLAYING or ATTRACT
// START 1P / START 2P begin a game, Esc / P (or a tap on the screen) pauses, and from the pause
// screen FIRE resumes and START quits back to attract mode.
//
// A game module exports `meta` and `createGame({bots})`; see PORTING.md for the contract.

import { Cabinet } from './cabinet.js';
import { Controls } from './controls.js';
import { Crt } from './crt.js';
import { drawCard, FONT } from './cards.js';

const TICK = 1000 / 60;
const GAME_OVER_DELAY = 70; // ticks of explosion before the GAME OVER card
const GAME_OVER_TIMEOUT = 60 * 20;
const DEMO_RESTART = 60 * 3;

const STATE = { ATTRACT: 'attract', PLAYING: 'playing', PAUSED: 'paused', OVER: 'over' };

/**
 * @param {HTMLElement} host element the cabinet fills
 * @param {object} game the game module
 * @param {string} artBase URL prefix of the game's cabinet art, ending in '/'
 */
export async function runArcade(host, game, artBase) {
  await document.fonts.load(`16px ${FONT}`);
  const touchFirst = matchMedia('(pointer: coarse)').matches;

  const playerCount = game.meta.players ?? 2;
  const controls = new Controls(game.meta.keyboard, playerCount);
  const cabinet = await Cabinet.load(host, artBase, controls);

  const surface = document.createElement('canvas');
  surface.width = game.meta.width;
  surface.height = game.meta.height;
  const ctx = surface.getContext('2d');
  const crt = new Crt(cabinet.screen, surface);
  cabinet.onResize = ({ w, h }) => crt.resize(w, h);
  cabinet.layout();

  let state = STATE.ATTRACT;
  const allBots = () => Array(playerCount).fill(true);
  let humans = Array(playerCount).fill(false);
  let session = game.createGame({ bots: allBots() });
  let timer = 0;
  let overTicks = 0;

  const begin = (players) => {
    humans = Array.from({ length: playerCount }, (_, i) => i < players);
    session = game.createGame({ bots: humans.map((h) => !h) });
    state = STATE.PLAYING;
    timer = 0;
    overTicks = 0;
  };
  const toAttract = () => {
    humans = Array(playerCount).fill(false);
    session = game.createGame({ bots: allBots() });
    state = STATE.ATTRACT;
    timer = 0;
    overTicks = 0;
  };
  const pause = () => {
    if (state === STATE.PLAYING) state = STATE.PAUSED;
    else if (state === STATE.PAUSED) state = STATE.PLAYING;
  };
  cabinet.onScreenTap = pause;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === STATE.PLAYING) state = STATE.PAUSED;
  });

  const startPressed = () =>
    controls.system.start_1p.pressed ? 1 : controls.system.start_2p.pressed ? Math.min(2, playerCount) : 0;

  function step() {
    timer++;
    const active = session.activePlayer ?? 0;
    const keyboardPlayer = state === STATE.PLAYING && humans[active] ? active : -1;
    const runsBots = state === STATE.PLAYING || state === STATE.ATTRACT || state === STATE.OVER;
    controls.sample({
      keyboardPlayer,
      bots: humans.map((human, i) => (!human && runsBots ? session.botInput(i) : null)),
    });

    if (session.over) overTicks++;
    const start = startPressed();
    switch (state) {
      case STATE.ATTRACT:
        if (start) begin(start);
        else if (overTicks > DEMO_RESTART) toAttract();
        else session.update(controls);
        break;
      case STATE.PLAYING:
        if (controls.system.pause.pressed) {
          pause();
          break;
        }
        session.update(controls);
        if (overTicks > GAME_OVER_DELAY) {
          state = STATE.OVER;
          timer = 0;
        }
        break;
      case STATE.PAUSED:
        if (controls.system.pause.pressed || controls.players.some((p, i) => humans[i] && p.pressed('fire'))) pause();
        else if (start) toAttract();
        break;
      case STATE.OVER:
        session.update(controls);
        if (start) begin(start);
        else if (timer > GAME_OVER_TIMEOUT) toAttract();
        break;
    }
  }

  const overlay = (lines, dim) => drawCard(ctx, lines, dim);

  function render(now) {
    session.draw(ctx);
    const blink = Math.floor(now / 500) % 2 === 0;
    const startHint =
      playerCount === 1
        ? touchFirst ? 'PRESS START' : 'PRESS 1 TO START'
        : touchFirst ? 'PRESS 1 OR 2 PLAYER' : 'PRESS 1 OR 2 TO START';
    if (state === STATE.ATTRACT) {
      overlay(
        [
          { text: game.meta.title, size: 44, color: '#ffd23f' },
          { text: '', size: 10 },
          { text: blink ? startHint : '', size: 18 },
          { text: '', size: 6 },
          { text: 'FREE PLAY', size: 14, color: '#9fe7ff' },
        ],
        0.25,
      );
    } else if (state === STATE.PAUSED) {
      overlay(
        [
          { text: 'PAUSED', size: 40, color: '#ffd23f' },
          { text: '', size: 8 },
          { text: touchFirst ? 'FIRE  RESUME' : 'FIRE OR ESC  RESUME', size: 16 },
          { text: 'START  QUIT', size: 16 },
        ],
        0.55,
      );
    } else if (state === STATE.OVER) {
      overlay(
        [
          { text: 'GAME OVER', size: 44, color: '#ff5a3c' },
          { text: '', size: 6 },
          { text: session.resultText, size: 22, color: '#fff' },
          { text: '', size: 10 },
          { text: blink ? startHint : '', size: 16 },
        ],
        0.35,
      );
    }
    crt.render(now / 1000);

    const lampOn = (state === STATE.ATTRACT || state === STATE.OVER) && blink;
    const keyHints = controls.lastSource === 'keyboard' && !touchFirst ? buildKeyHints(cabinet.controlIds, game.meta.keyHints) : null;
    cabinet.setStates(controls.panelStates(cabinet.controlIds), { lamps: ['start_1p', 'start_2p'], lampOn, keyHints });
  }

  let last = performance.now();
  let pending = 0;
  function frame(now) {
    pending = Math.min(pending + (now - last), TICK * 10);
    last = now;
    while (pending >= TICK) {
      step();
      pending -= TICK;
    }
    render(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** @param hints either {stick, fire, ...} for every player, or {p1: {...}, p2: {...}} */
function buildKeyHints(controlIds, hints) {
  const result = { start_1p: '1', start_2p: '2' };
  for (const id of controlIds) {
    const match = /^(p\d)_(.+)$/.exec(id);
    if (!match) continue;
    const own = hints[match[1]] ?? hints;
    if (own[match[2]]) result[id] = own[match[2]];
  }
  return result;
}
