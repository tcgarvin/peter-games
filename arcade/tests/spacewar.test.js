// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame } from '../games/spacewar.js';
import { DeliveryZone, MAX_PICKUP_VELOCITY } from '../games/spacewar/entities.js';
import { PlayerInput } from '../shell/controls.js';

function botDrivenInput(game, bots) {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    sample() {
      players.forEach((p, i) => {
        const bot = bots[i] ? game.botInput(i) : { x: 0, y: 0, buttons: {} };
        p.apply(bot.x, bot.y, bot.buttons);
      });
    },
    player: (i) => players[i],
  };
}

function run(game, input, maxTicks) {
  let ticks = 0;
  while (!game.over && ticks < maxTicks) {
    input.sample();
    game.update(input);
    ticks++;
  }
  return ticks;
}

/** A game with no asteroids, so nothing can crash. */
function emptySpace(bots = [false, false]) {
  const game = createGame({ bots });
  game.asteroids = [];
  game.zoneSpawnTimer = Infinity;
  return game;
}

const idle = { player: () => new PlayerInput() };

test('CPU-only games end within a few minutes with a sensible result', () => {
  for (let round = 0; round < 10; round++) {
    const game = createGame({ bots: [true, true] });
    const ticks = run(game, botDrivenInput(game, [true, true]), 60 * 60 * 5);
    assert.ok(game.over, `round ${round} did not finish in ${ticks} ticks`);
    assert.match(game.resultText, /^(CPU WINS|ALL SHIPS DESTROYED)$/);
  }
});

test('CPU ships fly through the virtual stick and THRUST button', () => {
  const game = createGame({ bots: [true, false] });
  assert.throws(() => game.botInput(1));
  const input = botDrivenInput(game, [true, false]);
  let thrusted = false;
  let turned = false;
  for (let i = 0; i < 600 && !game.over; i++) {
    input.sample();
    thrusted ||= input.player(0).down('fire');
    turned ||= input.player(0).x !== 0;
    game.update(input);
  }
  assert.ok(thrusted && turned);
});

test('CPU ships pick up and deliver cargo', () => {
  let delivered = 0;
  for (let round = 0; round < 10 && delivered === 0; round++) {
    const game = createGame({ bots: [true, true] });
    game.asteroids = [];
    const input = botDrivenInput(game, [true, true]);
    for (let i = 0; i < 60 * 90 && !game.over; i++) {
      input.sample();
      game.update(input);
      game.asteroids = []; // keep space empty so only deliveries can end the game
    }
    delivered += game.ships.reduce((sum, s) => sum + s.credits, 0);
  }
  assert.ok(delivered > 0, 'no CPU delivered anything in empty space');
});

test('stick up and the THRUST button both accelerate; left/right rotate', () => {
  const game = emptySpace();
  const p1 = new PlayerInput();
  const input = { player: (i) => (i === 0 ? p1 : new PlayerInput()) };
  const ship = game.ships[0];
  ship.angle = 0;
  p1.apply(0, -1, {});
  game.update(input);
  assert.ok(ship.velocityX > 0.19);
  const vx = ship.velocityX;
  p1.apply(0, 0, { fire: true });
  game.update(input);
  assert.ok(ship.velocityX > vx + 0.19);
  p1.apply(1, 0, {});
  game.update(input);
  assert.equal(ship.angle, 3);
  p1.apply(-1, 0, {});
  game.update(input);
  game.update(input);
  assert.equal(ship.angle, 357);
});

test('a slow ship loads cargo in a pickup zone and is paid at a dropoff', () => {
  const game = emptySpace();
  const ship = game.ships[0];
  const pickup = new DeliveryZone(ship.x + 30, ship.y, 'pickup');
  const dropoff = new DeliveryZone(ship.x - 900, ship.y, 'dropoff');
  game.zones = [pickup, dropoff];
  ship.velocityX = MAX_PICKUP_VELOCITY + 1;
  game.update(idle);
  assert.equal(ship.hasCargo, false, 'too fast to load');
  ship.velocityX = 0.5;
  game.update(idle);
  assert.equal(ship.hasCargo, true);
  dropoff.x = ship.x;
  ship.interactionCooldown = 0;
  game.update(idle);
  assert.equal(ship.hasCargo, false);
  assert.equal(ship.credits, 1);
});

test('five credits win; crashing into a rock destroys the ship and splits the rock', () => {
  const game = emptySpace();
  game.ships[1].credits = 5;
  game.update(idle);
  assert.ok(game.over);
  assert.equal(game.resultText, 'PLAYER 2 WINS');

  const crash = emptySpace([false, true]);
  const rock = createGame({ bots: [true, true] }).asteroids[0];
  rock.sizeCategory = 'large';
  rock.size = 40;
  rock.velocityX = rock.velocityY = 0;
  rock.x = crash.ships[0].x;
  rock.y = crash.ships[0].y;
  crash.asteroids = [rock];
  crash.update(idle);
  assert.ok(crash.ships[0].destroyed);
  assert.ok(crash.asteroids.length >= 2 && crash.asteroids.every((a) => a.sizeCategory === 'medium'));
  // The only human is gone, so the game is over even though two CPU ships still fly.
  assert.ok(crash.over);
  assert.equal(crash.resultText, 'SHIP DESTROYED');
});
