// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame } from '../games/quarterback.js';
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

/** Lets everyone drop onto the turf from where they line up. */
function settle(tick) {
  for (let i = 0; i < 20; i++) tick();
}

test('the CPU scores touchdowns, and a game it loses ends with its score', () => {
  let touchdowns = 0;
  for (let round = 0; round < 3; round++) {
    const game = createGame({ bots: [true] });
    const p = new PlayerInput();
    const input = { player: () => p };
    for (let t = 0; t < 60 * 60 && !game.over; t++) {
      const bot = game.botInput(0);
      p.apply(bot.x, bot.y, bot.buttons);
      game.update(input);
    }
    touchdowns += game.score / 6;
    if (game.over) assert.match(game.resultText, /^SCORE \d+$/);
  }
  assert.ok(touchdowns >= 3, `the CPU only scored ${touchdowns} touchdowns in three minutes`);
});

test('botInput refuses a human player', () => {
  assert.throws(() => createGame({ bots: [false] }).botInput(0));
});

test('holding THROW charges from 40 by 2.5 a tick; letting go throws at 45 degrees', () => {
  const { game, tick } = humanGame();
  settle(tick);
  tick(0, { fire2: true });
  assert.equal(game.play.power, 42.5);
  for (let i = 0; i < 9; i++) tick(0, { fire2: true });
  assert.equal(game.play.power, 65);
  tick();
  const ball = game.play.ball;
  assert.ok(ball.active);
  assert.ok(!game.play.qb.hasBall);
  // Thrown at 65 / 5 = 13 px a tick, then one tick of flight with gravity.
  assert.ok(Math.abs(ball.vx - 13 * Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(ball.vy - (-13 * Math.SQRT1_2 + 0.8)) < 1e-9);
});

test('the throw power bounces between 40 and 150', () => {
  const { game, tick } = humanGame();
  settle(tick);
  let top = 0;
  for (let i = 0; i < 100; i++) {
    tick(0, { fire2: true });
    top = Math.max(top, game.play.power);
  }
  assert.equal(top, 150);
  assert.ok(game.play.power < 150 && game.play.power >= 40);
});

test('a caught pass hands the stick to the receiver', () => {
  const { game, tick } = humanGame();
  settle(tick);
  const play = game.play;
  play.throwBall = function () {
    Object.assign(this.ball, { x: this.wr.x + 15, y: this.wr.y + 20, vx: 0, vy: 0, active: true, caught: false });
    this.qb.hasBall = false;
  };
  tick(0, { fire2: true });
  tick();
  assert.equal(play.controlled, 'wr');
  assert.ok(play.wr.hasBall);
  const x0 = play.wr.x;
  tick(1);
  assert.equal(play.wr.x, x0 + 5);
});

test('a tackle costs one down; four failed downs end the game', () => {
  const { game, tick } = humanGame();
  for (let down = 1; down <= 4; down++) {
    assert.equal(game.down, down);
    // Both defenders on the quarterback at once still costs only one down.
    for (const d of game.play.defenders) d.x = game.play.qb.x;
    tick();
    assert.equal(game.play.result, 'tackled');
    for (let i = 0; i < 200 && !game.over && game.play.result; i++) tick();
  }
  assert.ok(game.over);
  assert.equal(game.tackles, 4);
  assert.equal(game.resultText, 'SCORE 0');
});

test('carrying the ball into the end zone scores 6 and resets the downs', () => {
  const { game, tick } = humanGame();
  settle(tick);
  game.down = 3;
  game.play.defenders = [];
  game.play.qb.x = 1040;
  tick(1);
  tick(1);
  assert.equal(game.play.result, 'touchdown');
  assert.equal(game.score, 6);
  assert.equal(game.down, 1);
});

test('an incomplete pass costs a down', () => {
  const { game, tick } = humanGame();
  settle(tick);
  game.play.wr.x = 0;
  game.play.wr.route = 1000;
  tick(0, { fire2: true });
  tick();
  for (let i = 0; i < 120 && !game.play.result; i++) tick();
  assert.equal(game.play.result, 'incomplete');
  assert.equal(game.down, 2);
});
