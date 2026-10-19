// net.js - WebRTC multiplayer via PeerJS.
// Provides host/join room-code flow and state-snapshot synchronisation.
//
// Topology: star (host relays between peers).
// Sync: state snapshot every NET_SEND_EVERY ticks; remote cars interpolate.

import Peer from 'peerjs';

// How many sim ticks between state broadcasts
const NET_SEND_EVERY = 3;

// Message type constants
const MSG_INIT     = 'INIT';
const MSG_STATE    = 'STATE';
const MSG_LAP      = 'LAP';
const MSG_FINISHED = 'FINISHED';
const MSG_RELAY    = 'RELAY'; // host uses this to forward messages between peers

export class NetManager extends EventTarget {
  /**
   * @param {import('./sim.js').GameSim} sim
   */
  constructor(sim) {
    super();
    this._sim       = sim;
    this._peer      = null;
    this._localId   = null;
    this._isHost    = false;
    this._conns     = new Map(); // peerId → DataConnection
    this._sendEvery = 0;
  }

  /**
   * Host a game.  Initialises PeerJS and returns the room code (peer ID).
   * @returns {Promise<string>}
   */
  async host() {
    this._isHost = true;
    this._peer   = await this._createPeer();
    this._localId = this._peer.id;

    this._peer.on('connection', (conn) => {
      this._setupConn(conn);
    });

    return this._localId;
  }

  /**
   * Join a game using a room code (the host's peer ID).
   * @param {string} roomCode
   */
  async join(roomCode) {
    this._isHost = false;
    this._peer   = await this._createPeer();
    this._localId = this._peer.id;

    const conn = this._peer.connect(roomCode, { reliable: false, serialization: 'json' });
    await this._waitOpen(conn);
    this._setupConn(conn);
  }

  /**
   * Send the local car's state snapshot.  Should be called once per sim tick.
   * Rate-limited internally to NET_SEND_EVERY ticks.
   * @param {object|null} snapshot
   */
  sendTick(snapshot) {
    if (!snapshot || this._conns.size === 0) return;
    this._sendEvery++;
    if (this._sendEvery % NET_SEND_EVERY !== 0) return;

    const msg = { type: MSG_STATE, ...snapshot, from: this._localId };

    if (this._isHost) {
      // Host broadcasts its own state to all peers, and relays peer states.
      for (const conn of this._conns.values()) {
        this._send(conn, msg);
      }
    } else {
      // Client sends to host only; host relays to others.
      for (const conn of this._conns.values()) {
        this._send(conn, msg);
        break; // only one connection for a client (to host)
      }
    }
  }

  /** Host broadcasts a START signal to all connected peers. */
  broadcastStart() {
    if (!this._isHost) return;
    for (const conn of this._conns.values()) {
      this._send(conn, { type: 'START' });
    }
  }

  disconnect() {
    for (const conn of this._conns.values()) conn.close();
    this._conns.clear();
    if (this._peer) { this._peer.destroy(); this._peer = null; }
  }

  get localId() { return this._localId ?? 'offline'; }
  get peers()   { return [...this._conns.keys()]; }

  // ---- Internal ----

  _createPeer() {
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      peer.on('open', () => resolve(peer));
      peer.on('error', reject);
    });
  }

  _waitOpen(conn) {
    return new Promise((resolve) => {
      if (conn.open) { resolve(); return; }
      conn.on('open', resolve);
    });
  }

  _setupConn(conn) {
    const onOpen = () => {
      this._conns.set(conn.peer, conn);
      this.dispatchEvent(new CustomEvent('peer-joined', { detail: { id: conn.peer } }));

      // Host sends INIT to the new peer with current sim state
      if (this._isHost) {
        const snap = this._sim.getLocalSnapshot();
        this._send(conn, {
          type: MSG_INIT,
          hostId: this._localId,
          snapshot: snap,
          existingPeers: this.peers.filter(id => id !== conn.peer),
        });
      }
    };

    // If conn is already open (e.g. called after _waitOpen resolved), run immediately.
    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
    }

    conn.on('data', (msg) => this._onData(conn.peer, msg));

    conn.on('close', () => {
      this._conns.delete(conn.peer);
      this.dispatchEvent(new CustomEvent('peer-left', { detail: { id: conn.peer } }));
    });

    conn.on('error', (err) => {
      console.warn('NetManager conn error:', err);
      this._conns.delete(conn.peer);
      this.dispatchEvent(new CustomEvent('peer-left', { detail: { id: conn.peer } }));
    });
  }

  _onData(fromId, msg) {
    switch (msg.type) {
      case MSG_INIT:
        // Client received INIT from host (peer list, not race start)
        this.dispatchEvent(new CustomEvent('init', { detail: msg }));
        break;

      case 'START':
        // Host started the race
        this.dispatchEvent(new CustomEvent('start', { detail: {} }));
        break;

      case MSG_STATE:
        // State snapshot from a remote car
        this.dispatchEvent(new CustomEvent('remote-snapshot', {
          detail: { id: msg.from, snapshot: msg },
        }));

        // Host relays to all other peers
        if (this._isHost) {
          const relay = { ...msg };
          for (const [id, conn] of this._conns) {
            if (id !== fromId) this._send(conn, relay);
          }
        }
        break;

      case MSG_LAP:
        this.dispatchEvent(new CustomEvent('remote-lap', { detail: { id: msg.from, lapCount: msg.lapCount } }));
        if (this._isHost) {
          for (const [id, conn] of this._conns) {
            if (id !== fromId) this._send(conn, msg);
          }
        }
        break;

      case MSG_FINISHED:
        this.dispatchEvent(new CustomEvent('remote-finished', { detail: { id: msg.from } }));
        break;
    }
  }

  _send(conn, data) {
    try {
      if (conn.open) conn.send(data);
    } catch (e) {
      console.warn('NetManager send failed:', e);
    }
  }
}
