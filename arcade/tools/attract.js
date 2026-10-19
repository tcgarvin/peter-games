// Records a game's attract mode (CPU vs CPU under its title card) as a list of PNG frames for
// the lobby's cabinet screens. Loaded by tools/attract.html; see tools/record_attract.py.

import { Controls } from '../shell/controls.js';
import { drawCard, FONT } from '../shell/cards.js';

const TICKS_PER_SECOND = 60;
const BLINK_SECONDS = 0.5;

/**
 * @param {string} id game id
 * @param {{width: number, fps: number, seconds: number, warmupSeconds: number}} options
 *   width of the frames in pixels (height follows the game's aspect); warmup lets the demo get
 *   going before recording starts
 * @returns {Promise<string[]>} PNG data URLs
 */
async function recordAttract(id, { width, fps, seconds, warmupSeconds }) {
  await document.fonts.load(`16px ${FONT}`);
  const game = await import(`../games/${id}.js`);
  const { meta } = game;
  const playerCount = meta.players ?? 2;
  const controls = new Controls(meta.keyboard, playerCount);
  const session = game.createGame({ bots: Array(playerCount).fill(true) });
  const tick = () => {
    controls.sample({ keyboardPlayer: -1, bots: Array.from({ length: playerCount }, (_, i) => session.botInput(i)) });
    session.update(controls);
  };

  const surface = document.createElement('canvas');
  surface.width = meta.width;
  surface.height = meta.height;
  const ctx = surface.getContext('2d');
  const frame = document.createElement('canvas');
  frame.width = width;
  frame.height = Math.round((width * meta.height) / meta.width);
  const frameCtx = frame.getContext('2d');
  frameCtx.imageSmoothingQuality = 'high';

  for (let i = 0; i < warmupSeconds * TICKS_PER_SECOND; i++) tick();
  const ticksPerFrame = TICKS_PER_SECOND / fps;
  if (!Number.isInteger(ticksPerFrame)) throw new Error(`fps ${fps} must divide ${TICKS_PER_SECOND}`);
  const frames = [];
  for (let f = 0; f < seconds * fps; f++) {
    for (let i = 0; i < ticksPerFrame; i++) tick();
    session.draw(ctx);
    const blinkOn = Math.floor(f / fps / BLINK_SECONDS) % 2 === 0;
    drawCard(
      ctx,
      [
        { text: meta.title, size: 44, color: '#ffd23f' },
        { text: '', size: 12 },
        { text: blinkOn ? 'INSERT COIN' : '', size: 22 },
      ],
      0.3,
    );
    frameCtx.drawImage(surface, 0, 0, frame.width, frame.height);
    frames.push(frame.toDataURL('image/png'));
  }
  return frames;
}

window.recordAttract = recordAttract;
