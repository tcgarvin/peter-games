// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame } from '../games/platformer.js';
import { PlayerInput } from '../shell/controls.js';

function humanGame() {
  const game = createGame({ bots: [false] });
  const p = new PlayerInput();
  const input = { player: () => p };
  const tick = (x = 0, buttons = {}) => {
    p.apply(x, 0, buttons);
    game.update(input);
  };
  return { game, tick };
}

/** Lets the player drop onto the floor from the spawn point. */
function settle(tick) {
  for (let i = 0; i < 30; i++) tick();
}

test('the CPU clears levels within a few minutes, with a sensible result', () => {
  for (let round = 0; round < 3; round++) {
    const game = createGame({ bots: [true] });
    const p = new PlayerInput();
    const input = { player: () => p };
    let ticks = 0;
    while (!game.over && ticks < 60 * 60 * 3) {
      const bot = game.botInput(0);
      p.apply(bot.x, bot.y, bot.buttons);
      game.update(input);
      ticks++;
    }
    assert.ok(game.over, `round ${round} did not finish in ${ticks} ticks`);
    assert.ok(game.score >= 5, `round ${round} only scored ${game.score}`);
    assert.match(game.resultText, /^(ALL CLEAR! SCORE 14|LEVEL [12] SCORE \d+)$/);
  }
});

test('botInput refuses a human player', () => {
  assert.throws(() => createGame({ bots: [false] }).botInput(0));
});

test('the stick runs at the original 7 px per frame and the edge of the screen stops you', () => {
  const { game, tick } = humanGame();
  settle(tick);
  const x0 = game.world.player.x;
  tick(1);
  assert.equal(game.world.player.x, x0 + 7);
  for (let i = 0; i < 40; i++) tick(-1);
  assert.equal(game.world.player.x, 0);
});

test('JUMP launches at -20 and needs a fresh press to jump again', () => {
  const { game, tick } = humanGame();
  settle(tick);
  const floorY = game.world.player.y;
  tick(0, { fire: true });
  assert.ok(game.world.player.vy < -19 && game.world.player.vy > -20);
  let top = floorY;
  for (let i = 0; i < 120; i++) {
    tick(0, { fire: true }); // held, not re-pressed
    top = Math.min(top, game.world.player.y);
  }
  assert.ok(floorY - top > 300, `jump only rose ${floorY - top}px`);
  assert.equal(game.world.player.y, floorY);
  assert.ok(game.world.player.onGround, 'holding JUMP does not bounce');
});

test('a spike costs a life and respawns you; losing all three ends the game', () => {
  const { game, tick } = humanGame();
  const world = game.world;
  world.spikes.push({ x: 0, y: 0, w: 800, h: 600 });
  tick();
  assert.equal(game.lives, 2);
  for (let i = 0; i < 200 && game.lives === 2; i++) tick();
  assert.equal(game.lives, 1);
  for (let i = 0; i < 200 && !game.over; i++) tick();
  assert.ok(game.over);
  assert.equal(game.resultText, 'LEVEL 1 SCORE 0');
});

test('collecting every coin moves on to level 2 after the pause', () => {
  const { game, tick } = humanGame();
  game.world.taken = game.world.taken.map((_, i) => i > 0);
  game.world.player.x = 150;
  game.world.player.y = 418;
  tick();
  assert.equal(game.score, 1);
  assert.equal(game.level, 1);
  for (let i = 0; i < 200; i++) tick();
  assert.equal(game.level, 2);
  assert.equal(game.world.coinsLeft, 9);
  assert.equal(game.score, 1);
});
