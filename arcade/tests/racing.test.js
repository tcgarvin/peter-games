// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame, isOnTrack, POWERUP_POSITIONS, TOTAL_LAPS, TRACK_WAYPOINTS } from '../games/racing.js';
import { PlayerInput } from '../shell/controls.js';

const COUNTDOWN = 180;

function botDrivenInput(game) {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    sample() {
      players.forEach((p, i) => {
        const bot = game.botInput(i);
        p.apply(bot.x, bot.y, bot.buttons);
      });
    },
    player: (i) => players[i],
  };
}

function humanInput() {
  const players = [new PlayerInput(), new PlayerInput()];
  return { players, player: (i) => players[i] };
}

test('two CPU drivers finish a three-lap race with a winner', () => {
  for (let round = 0; round < 4; round++) {
    const game = createGame({ bots: [true, true] });
    const input = botDrivenInput(game);
    let ticks = 0;
    while (!game.over && ticks < 60 * 60 * 3) {
      input.sample();
      game.update(input);
      ticks++;
    }
    assert.ok(game.over, `round ${round} did not finish in ${ticks} ticks`);
    assert.match(game.resultText, /^PLAYER [12] WINS$/);
    const winner = game.cars[game.winner];
    assert.ok(winner.lap === TOTAL_LAPS || !game.cars[1 - game.winner].alive);
  }
});

test('the attract demo skips the countdown, a game with a human keeps it', () => {
  assert.equal(createGame({ bots: [true, true] }).state, 'racing');
  assert.equal(createGame({ bots: [false, true] }).state, 'countdown');
  assert.equal(createGame({ bots: [false, false] }).state, 'countdown');
});

test('a human slot cannot be driven by the CPU', () => {
  const game = createGame({ bots: [false, true] });
  assert.throws(() => game.botInput(0));
  assert.doesNotThrow(() => game.botInput(1));
});

test('cars hold still during the countdown, then the gas pedal moves them', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  const car = game.cars[0];
  const startX = car.x;
  for (let i = 0; i < COUNTDOWN - 1; i++) {
    input.players[0].apply(0, -1, {});
    game.update(input);
  }
  assert.equal(car.x, startX);
  for (let i = 0; i < 30; i++) {
    input.players[0].apply(0, -1, {});
    game.update(input);
  }
  assert.ok(car.x > startX + 20, 'holding up accelerates along the start straight');
  assert.ok(Math.abs(car.speed - 2.9) < 0.11, `speed ${car.speed}`);
});

test('a car driven into the grass is stopped at the edge of the track', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  const car = game.cars[0];
  car.angle = -90; // straight down, off the start straight into the infield
  game.countdownTimer = 1;
  for (let i = 0; i < 200; i++) {
    input.players[0].apply(0, -1, {});
    game.update(input);
  }
  assert.ok(isOnTrack(car.x, car.y));
  assert.ok(car.speed < 1, 'scraping the wall costs speed');
});

test('a lap only counts after the required checkpoints', () => {
  const game = createGame({ bots: [false, false] });
  const car = game.cars[0];
  const drive = { accel: false, brake: false, left: false, right: false };
  const visit = (index) => {
    [car.x, car.y] = TRACK_WAYPOINTS[index];
    car.update(drive);
    car.checkpointCooldowns.clear();
  };
  visit(0);
  assert.equal(car.lap, 0, 'crossing the line without going round is not a lap');
  for (const index of [3, 6, 10]) visit(index);
  visit(0);
  assert.equal(car.lap, 0, 'skipping checkpoint 12 is not a lap');
  for (const index of [3, 6, 10, 12]) visit(index);
  visit(0);
  assert.equal(car.lap, 1);
});

test('the gun power-up lets FIRE shoot, and three hits wreck the other car', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  game.countdownTimer = 1;
  game.update(input);
  const [shooter, target] = game.cars;
  shooter.ammo = 5;
  shooter.x = 600;
  shooter.y = 90;
  shooter.angle = 0;
  target.x = 760;
  target.y = 90;
  for (let i = 0; i < 120 && !game.over; i++) {
    input.players[0].apply(0, 0, { fire: i % 2 === 0 });
    game.update(input);
    target.x = 760;
    target.y = 90;
  }
  assert.ok(game.over);
  assert.equal(target.alive, false);
  assert.equal(game.resultText, 'PLAYER 1 WINS');
});

test('every power-up sits on the track where a car can reach it', () => {
  for (const [x, y] of POWERUP_POSITIONS) assert.ok(isOnTrack(x, y), `power-up at ${x},${y}`);
});
