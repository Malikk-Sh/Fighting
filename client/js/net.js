// Тонкая обёртка над WebSocket: события по типу сообщения + пинг.

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.onDisconnect = null;
    this.ping = 0;
    this._pingId = 0;
    this._pingSentAt = 0;
    this._pingTimer = 0;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this._pingTimer = setInterval(() => {
          this._pingId += 1;
          this._pingSentAt = performance.now();
          this.send({ t: 'ping', id: this._pingId });
        }, 2000);
        resolve();
      };
      ws.onerror = () => reject(new Error('ws error'));
      ws.onclose = () => {
        clearInterval(this._pingTimer);
        if (this.onDisconnect) this.onDisconnect();
      };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.t === 'pong') {
          if (msg.id === this._pingId) this.ping = Math.round(performance.now() - this._pingSentAt);
          return;
        }
        const h = this.handlers.get(msg.t);
        if (h) h(msg);
      };
    });
  }

  on(type, fn) { this.handlers.set(type, fn); }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  close() {
    if (this.ws) {
      this.ws.onclose = null;
      clearInterval(this._pingTimer);
      this.ws.close();
      this.ws = null;
    }
  }
}
