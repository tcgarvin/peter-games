// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Monster, createGame } from '../games/slicing.js';
import { PlayerInput } from '../shell/controls.js';

const idle = () => ({ x: 0, y: 0, buttons: {}, aim: { x: 0, y: 0 } });

function drive(game, pad, controls) {
  const { x, y, buttons, aim } = controls;
  pad.apply(x, y, buttons, aim);
  game.update({ player: () => pad });
}

/** A monster parked at an offset from the hero, standing still. */
function parkMonster(game, dx, dy) {
  const monster = Object.assign(new Monster(), {
    x: game.player.x + dx,
    y: game.player.y + dy,
    dx: 0,
    dy: 0,
    variant: 0,
  });
  game.monsters = [monster];
  return monster;
}

test('the CPU slicer scores and is eventually overrun', () => {
  for (let round = 0; round < 3; round++) {
    const game = createGame({ bots: [true] });
    const pad = new PlayerInput();
    let ticks = 0;
    while (!game.over && ticks < 60 * 60 * 15) {
      drive(game, pad, game.botInput(0));
      ticks++;
    }
    assert.ok(game.over, `round ${round} did not finish in ${ticks} ticks`);
    assert.ok(game.score > 0, 'the CPU sliced nothing');
    assert.match(game.resultText, /^SCORE \d+ WAVE \d+$/);
    assert.ok(game.resultText.length <= 20, game.resultText);
  }
});

test('botInput refuses a human player', () => {
  const game = createGame({ bots: [false] });
  assert.throws(() => game.botInput(0));
});

test('pushing the aim stick slices that way and kills a monster there', () => {
  const game = createGame({ bots: [false] });
  const pad = new PlayerInput();
  const monster = parkMonster(game, 80, 0);
  drive(game, pad, { x: 0, y: 0, buttons: {}, aim: { x: 1, y: 0 } });
  assert.equal(game.monsters.includes(monster), false);
  assert.equal(game.score, 10);
});

test('a slice the other way misses', () => {
  const game = createGame({ bots: [false] });
  const pad = new PlayerInput();
  const monster = parkMonster(game, 80, 0);
  drive(game, pad, { x: 0, y: 0, buttons: {}, aim: { x: -1, y: 0 } });
  assert.ok(game.monsters.includes(monster));
  assert.equal(Math.abs(game.player.sliceAngle), 180);
});

test('holding the aim stick re-swings when each swing ends', () => {
  const game = createGame({ bots: [false] });
  game.monsters = [];
  const pad = new PlayerInput();
  const starts = [];
  let previous = 0;
  for (let t = 0; t < 40; t++) {
    drive(game, pad, { x: 0, y: 0, buttons: {}, aim: { x: 0, y: -1 } });
    if (game.player.slicing > previous) starts.push(t);
    previous = game.player.slicing;
  }
  assert.deepEqual(starts, [0, 10, 20, 30]);
  assert.equal(game.player.sliceAngle, 90);
});

test('SLICE button swings toward the last movement direction', () => {
  const game = createGame({ bots: [false] });
  const pad = new PlayerInput();
  drive(game, pad, { x: 0, y: 1, buttons: {}, aim: { x: 0, y: 0 } });
  drive(game, pad, { x: 0, y: 0, buttons: { fire: true }, aim: { x: 0, y: 0 } });
  assert.ok(game.player.slicing > 0);
  assert.equal(game.player.sliceAngle, -90);
});

test('a monster reaching the hero hurts and the game ends at zero health', () => {
  const game = createGame({ bots: [false] });
  const pad = new PlayerInput();
  game.player.health = 4;
  parkMonster(game, 30, 0);
  drive(game, pad, idle());
  assert.ok(game.over);
  assert.equal(game.player.health, 0);
});
