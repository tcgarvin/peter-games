// net.test.js — NetManager tests with PeerJS mocked.
//
// PeerJS relies on browser networking (WebRTC / WebSockets) which is
// unavailable in tests.  We mock Peer to return controllable fakes so we can
// test the NetManager state machine, event wiring, and message routing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- PeerJS mock ----
// vi.mock factory is hoisted to top of file, so classes must be defined inside it.
// We capture the constructor via a module-level ref so tests can call _inboundConnection.

vi.mock('peerjs', () => {
  // Minimal EventEmitter mixin so .on() works like real PeerJS.
  class Emitter {
    constructor() { this._handlers = {}; }
    on(event, fn) {
      (this._handlers[event] ??= []).push(fn);
      return this;
    }
    _emit(event, ...args) {
      (this._handlers[event] ?? []).forEach(fn => fn(...args));
    }
  }

  class FakeConnection extends Emitter {
    constructor(peerId) {
      super();
      this.peer  = peerId;
      this.open  = true;
      this.send  = vi.fn();
      this.close = vi.fn();
    }
    /** Simulate receiving a data message — calls .on('data') handlers with raw data. */
    _receive(data) { this._emit('data', data); }
    /** Simulate the connection closing. */
    _close()       { this._emit('close'); }
  }

  class FakePeer extends Emitter {
    constructor() {
      super();
      this.id      = 'fake-peer-' + Math.random().toString(36).slice(2, 8);
      this.destroy = vi.fn();
      // Emit 'open' asynchronously so the Promise can be set up first.
      Promise.resolve().then(() => this._emit('open'));
    }
    connect(targetId) {
      const conn = new FakeConnection(targetId);
      Promise.resolve().then(() => conn._emit('open'));
      return conn;
    }
    /** Simulate an inbound connection from a remote peer. */
    _inboundConnection(peerId) {
      const conn = new FakeConnection(peerId);
      this._emit('connection', conn);
      Promise.resolve().then(() => conn._emit('open'));
      return conn;
    }
  }

  return { default: FakePeer };
});

import { NetManager } from '../net.js';

// ---- Simple sim stub ----

function makeSimStub() {
  return {
    cars:             [],
    addCar:           vi.fn(),
    removeCar:        vi.fn(),
    applyRemoteState: vi.fn(),
    getLocalSnapshot: vi.fn().mockReturnValue({
      x: 0, z: 0, angle: 0, speed: 0, lapCount: 0, seq: 1,
    }),
  };
}

// ---- Constructor / defaults ----

describe('NetManager defaults', () => {
  it('localId returns "offline" before connecting', () => {
    const net = new NetManager(makeSimStub());
    expect(net.localId).toBe('offline');
  });

  it('peers returns empty array before connecting', () => {
    const net = new NetManager(makeSimStub());
    expect(net.peers).toEqual([]);
  });

  it('sendTick is a no-op when not connected', () => {
    const net = new NetManager(makeSimStub());
    expect(() => net.sendTick({ x: 0, z: 0, angle: 0, speed: 0, lapCount: 0, seq: 1 })).not.toThrow();
  });

  it('sendTick is a no-op when snapshot is null', () => {
    const net = new NetManager(makeSimStub());
    expect(() => net.sendTick(null)).not.toThrow();
  });

  it('disconnect is safe to call before connecting', () => {
    const net = new NetManager(makeSimStub());
    expect(() => net.disconnect()).not.toThrow();
  });
});

// ---- host() ----

describe('NetManager.host', () => {
  it('returns a non-empty room code string', async () => {
    const net  = new NetManager(makeSimStub());
    const code = await net.host();
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
  });

  it('localId matches the returned room code', async () => {
    const net  = new NetManager(makeSimStub());
    const code = await net.host();
    expect(net.localId).toBe(code);
  });
});

// ---- join() ----

describe('NetManager.join', () => {
  it('resolves without throwing', async () => {
    const net = new NetManager(makeSimStub());
    await expect(net.join('some-room')).resolves.not.toThrow();
  });

  it('sets localId after joining', async () => {
    const net = new NetManager(makeSimStub());
    await net.join('some-room');
    expect(net.localId).not.toBe('offline');
  });
});

// ---- peer-joined event ----

describe('NetManager peer-joined event', () => {
  it('fires peer-joined when a client connects to the host', async () => {
    const net  = new NetManager(makeSimStub());
    await net.host();

    const joinedHandler = vi.fn();
    net.addEventListener('peer-joined', joinedHandler);

    // Simulate inbound connection
    net._peer._inboundConnection('remote-peer-1');
    await new Promise(r => setTimeout(r, 10)); // let microtasks flush

    expect(joinedHandler).toHaveBeenCalledTimes(1);
    const event = joinedHandler.mock.calls[0][0];
    expect(event.detail.id).toBe('remote-peer-1');
  });
});

// ---- peer-left event ----

describe('NetManager peer-left event', () => {
  it('fires peer-left when a connection closes', async () => {
    const net  = new NetManager(makeSimStub());
    await net.host();

    const leftHandler = vi.fn();
    net.addEventListener('peer-left', leftHandler);

    const conn = net._peer._inboundConnection('remote-peer-2');
    await new Promise(r => setTimeout(r, 10));

    conn._close();
    await new Promise(r => setTimeout(r, 0));

    expect(leftHandler).toHaveBeenCalledTimes(1);
    expect(leftHandler.mock.calls[0][0].detail.id).toBe('remote-peer-2');
  });

  it('removes the peer from the peers list after disconnect', async () => {
    const net = new NetManager(makeSimStub());
    await net.host();

    const conn = net._peer._inboundConnection('remote-peer-3');
    await new Promise(r => setTimeout(r, 10));
    expect(net.peers).toContain('remote-peer-3');

    conn._close();
    await new Promise(r => setTimeout(r, 0));
    expect(net.peers).not.toContain('remote-peer-3');
  });
});

// ---- remote-snapshot event ----

describe('NetManager remote-snapshot event', () => {
  it('fires remote-snapshot when a STATE message arrives', async () => {
    const net  = new NetManager(makeSimStub());
    await net.host();

    const snapHandler = vi.fn();
    net.addEventListener('remote-snapshot', snapHandler);

    const conn = net._peer._inboundConnection('sender-peer');
    await new Promise(r => setTimeout(r, 10));

    conn._receive({ type: 'STATE', from: 'sender-peer', x: 10, z: 20, angle: 1, speed: 5, lapCount: 0, seq: 42 });
    await new Promise(r => setTimeout(r, 0));

    expect(snapHandler).toHaveBeenCalledTimes(1);
    const { id, snapshot } = snapHandler.mock.calls[0][0].detail;
    expect(id).toBe('sender-peer');
    expect(snapshot.x).toBe(10);
    expect(snapshot.z).toBe(20);
  });
});

// ---- init event ----

describe('NetManager init event', () => {
  it('fires init when a client receives an INIT message', async () => {
    const net = new NetManager(makeSimStub());
    await net.join('host-room');

    const initHandler = vi.fn();
    net.addEventListener('init', initHandler);

    // The host connection was established during join(); find it.
    const [conn] = net._conns.values();
    conn._receive({ type: 'INIT', hostId: 'host-room', snapshot: null, existingPeers: [] });
    await new Promise(r => setTimeout(r, 0));

    expect(initHandler).toHaveBeenCalledTimes(1);
  });
});

// ---- start event ----

describe('NetManager start event', () => {
  it('fires start when a START message is received', async () => {
    const net = new NetManager(makeSimStub());
    await net.join('host-room');

    const startHandler = vi.fn();
    net.addEventListener('start', startHandler);

    const [conn] = net._conns.values();
    conn._receive({ type: 'START' });
    await new Promise(r => setTimeout(r, 0));

    expect(startHandler).toHaveBeenCalledTimes(1);
  });
});

// ---- broadcastStart ----

describe('NetManager.broadcastStart', () => {
  it('sends a START message to all connected peers when called by host', async () => {
    const net = new NetManager(makeSimStub());
    await net.host();

    const conn1 = net._peer._inboundConnection('client-1');
    const conn2 = net._peer._inboundConnection('client-2');
    await new Promise(r => setTimeout(r, 10));

    net.broadcastStart();

    const startMsg = { type: 'START' };
    expect(conn1.send).toHaveBeenCalledWith(expect.objectContaining(startMsg));
    expect(conn2.send).toHaveBeenCalledWith(expect.objectContaining(startMsg));
  });

  it('is a no-op when called by a non-host', async () => {
    const net = new NetManager(makeSimStub());
    await net.join('some-host');
    const [conn] = net._conns.values();
    const callsBefore = conn.send.mock.calls.length;

    net.broadcastStart();
    expect(conn.send.mock.calls.length).toBe(callsBefore); // no additional call
  });
});

// ---- sendTick rate limiting ----

describe('NetManager.sendTick rate limiting', () => {
  it('does not send on every tick (sends every NET_SEND_EVERY=3 ticks)', async () => {
    const net = new NetManager(makeSimStub());
    await net.host();

    const conn = net._peer._inboundConnection('listener');
    await new Promise(r => setTimeout(r, 10));
    conn.send.mockClear(); // ignore the INIT message sent on connection open

    const snap = { x: 0, z: 0, angle: 0, speed: 0, lapCount: 0, seq: 1 };
    net.sendTick(snap); // tick 1 — not sent (1 % 3 ≠ 0)
    net.sendTick(snap); // tick 2 — not sent
    net.sendTick(snap); // tick 3 — sent!

    expect(conn.send).toHaveBeenCalledTimes(1);
  });

  it('sends on every third tick', async () => {
    const net = new NetManager(makeSimStub());
    await net.host();

    const conn = net._peer._inboundConnection('listener2');
    await new Promise(r => setTimeout(r, 10));
    conn.send.mockClear(); // ignore INIT

    const snap = { x: 0, z: 0, angle: 0, speed: 0, lapCount: 0, seq: 1 };
    for (let i = 0; i < 9; i++) net.sendTick(snap);

    expect(conn.send).toHaveBeenCalledTimes(3); // ticks 3, 6, 9
  });
});

// ---- host relays messages between peers ----

describe('NetManager host relay', () => {
  it('host forwards a STATE message from one peer to all other peers', async () => {
    const net = new NetManager(makeSimStub());
    await net.host();

    const conn1 = net._peer._inboundConnection('peer-A');
    const conn2 = net._peer._inboundConnection('peer-B');
    await new Promise(r => setTimeout(r, 10));

    // peer-A sends a STATE message
    conn1._receive({ type: 'STATE', from: 'peer-A', x: 5, z: 5, angle: 0, speed: 2, lapCount: 0, seq: 1 });
    await new Promise(r => setTimeout(r, 0));

    // peer-B should receive the relay, peer-A should NOT receive its own message
    expect(conn2.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STATE', from: 'peer-A' })
    );
    expect(conn1.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STATE', from: 'peer-A' })
    );
  });
});

// ---- disconnect ----

describe('NetManager.disconnect', () => {
  it('closes all connections and destroys the peer', async () => {
    const net  = new NetManager(makeSimStub());
    await net.host();
    const conn = net._peer._inboundConnection('to-close');
    await new Promise(r => setTimeout(r, 10));

    const peer = net._peer; // capture before disconnect nulls it
    net.disconnect();

    expect(conn.close).toHaveBeenCalled();
    expect(peer.destroy).toHaveBeenCalled();
    expect(net.peers).toHaveLength(0);
  });

  it('calling disconnect twice does not throw', async () => {
    const net = new NetManager(makeSimStub());
    await net.host();
    net.disconnect();
    expect(() => net.disconnect()).not.toThrow();
  });
});
