// Игровой рендер: интерполяция снапшотов сервера, лёгкое предсказание
// собственного движения, камера, отрисовка арены/бойцов/эффектов.

import { drawArena } from './arena.js';
import { FighterView } from './fighter.js';
import { SpriteFighter, sprites, loadSprites } from './sprites.js';
import { fx } from './fx.js';
import { ARENA_W, WALL_PAD, BODY_BLOCK, MOVE_SPEED, ATTACK_COOLDOWN } from './game-const.js';

const INTERP_DELAY = 110;   // мс: рендерим прошлое, чтобы было между чем интерполировать
const MAX_SNAPS = 40;
const DPR_CAP = 2;          // выше — лишняя нагрузка на мобильном GPU

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.views = [new FighterView(0), new FighterView(1)];
    this.snaps = [];
    this.myIdx = -1;
    this.myDir = 0;
    this.phase = 'idle';
    this.active = false;
    this.predX = null;
    this.camX = ARENA_W / 2;
    this.readyAtLocal = 0;
    this.onCooldown = null; // колбэк для индикатора на кнопке

    loadSprites(); // спрайты подхватятся к старту матча; иначе — процедурный рендер

    this._lastT = performance.now();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 250));
    requestAnimationFrame((t) => this._frame(t));
  }

  _resize() {
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.dpr = dpr;
  }

  startMatch(myIdx) {
    this.myIdx = myIdx;
    this.snaps = [];
    this.myDir = 0;
    this.predX = null;
    this.phase = 'countdown';
    this.active = true;
    this.readyAtLocal = 0;
    const View = sprites.ready ? SpriteFighter : FighterView;
    this.views = [new View(0), new View(1)];
    fx.reset();
  }

  stop() { this.active = false; }

  onState(msg) {
    this.phase = msg.phase;
    this.snaps.push({ rt: performance.now(), p: msg.p });
    if (this.snaps.length > MAX_SNAPS) this.snaps.shift();
    const me = msg.p[this.myIdx];
    if (me) this.readyAtLocal = performance.now() + me.cd;
  }

  onEvent(msg) {
    const now = performance.now();
    if (msg.k === 'hit') {
      const y = -118; // высота груди в мировых координатах
      fx.burst(msg.x, y, msg.ko ? 1.6 : 1);
      fx.addShake(msg.ko ? 22 : 12);
      fx.hitStop(msg.ko ? 150 : 85);
      this.views[msg.victim].flash();
    }
  }

  setMyDir(dir) { this.myDir = dir; }

  // Оптимистичный кулдаун сразу после нажатия (сервер подтвердит снапшотом).
  noteAttackSent() {
    if (performance.now() >= this.readyAtLocal) {
      this.readyAtLocal = performance.now() + ATTACK_COOLDOWN;
    }
  }

  /* Интерполированное состояние на момент рендера. */
  _sample(now) {
    const snaps = this.snaps;
    if (!snaps.length) return null;
    const latest = snaps[snaps.length - 1];
    const rt = now - INTERP_DELAY;
    let s0 = latest, s1 = latest, alpha = 0;
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].rt <= rt) {
        s0 = snaps[i - 1];
        s1 = snaps[i];
        alpha = s1.rt > s0.rt ? Math.min(1, Math.max(0, (rt - s0.rt) / (s1.rt - s0.rt))) : 0;
        break;
      }
    }
    return {
      latest,
      x: [0, 1].map((i) => s0.p[i].x + (s1.p[i].x - s0.p[i].x) * alpha),
    };
  }

  _frame(t) {
    requestAnimationFrame((t2) => this._frame(t2));
    const now = performance.now();
    let dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now;

    if (!this.active) return;
    if (fx.frozen) return; // hit-stop: держим предыдущий кадр

    const sample = this._sample(now);
    if (sample) {
      const latest = sample.latest;
      for (let i = 0; i < 2; i++) {
        const p = latest.p[i];
        this.views[i].setState(p.st, now);
        this.views[i].facing = p.f;
        this.views[i].x = sample.x[i];
      }

      // предсказание собственного X: ввод применяется сразу, сервер мягко корректирует
      const meIdx = this.myIdx;
      if (meIdx >= 0) {
        const meSrv = latest.p[meIdx];
        const srvX = sample.x[meIdx];
        if (this.predX === null) this.predX = srvX;
        const canMove = this.phase === 'fighting' && (meSrv.st === 'idle' || meSrv.st === 'walk');
        if (canMove) this.predX += this.myDir * MOVE_SPEED * dt;
        this.predX = Math.max(WALL_PAD, Math.min(ARENA_W - WALL_PAD, this.predX));
        const oppX = sample.x[1 - meIdx];
        if (Math.abs(this.predX - oppX) < BODY_BLOCK) {
          this.predX = oppX + Math.sign(this.predX - oppX || (meIdx === 0 ? -1 : 1)) * BODY_BLOCK;
        }
        // сведение с сервером
        const diff = srvX - this.predX;
        if (Math.abs(diff) > 90) this.predX = srvX;
        else this.predX += diff * Math.min(1, dt * 4);
        this.views[meIdx].x = this.predX;
      }
    }

    for (const view of this.views) view.update(dt, now / 1000);
    fx.update(dt);

    if (this.onCooldown) this.onCooldown(Math.max(0, this.readyAtLocal - now), ATTACK_COOLDOWN);

    this._draw(now / 1000);
  }

  _draw(t) {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // камера: центр между бойцами + зум по дистанции (ближе бой — крупнее план)
    const sep = Math.abs(this.views[0].x - this.views[1].x);
    const needW = Math.max(600, sep + 340);
    const targetScale = Math.min(h / 720, w / needW);
    if (!this.scale) this.scale = targetScale;
    this.scale += (targetScale - this.scale) * 0.04;
    const scale = this.scale;
    const groundY = h * 0.8;
    const midX = (this.views[0].x + this.views[1].x) / 2;
    const visHalf = w / (2 * scale);
    let camTarget = ARENA_W / 2;
    if (ARENA_W > visHalf * 2) {
      camTarget = Math.max(visHalf, Math.min(ARENA_W - visHalf, midX));
    }
    this.camX += (camTarget - this.camX) * 0.06;

    const [shx, shy] = fx.shakeOffset();
    ctx.save();
    ctx.translate(shx, shy);

    drawArena(ctx, { w, h, camX: this.camX, scale, groundY, t });

    // мировые координаты: (0,0) — пол в точке camX
    ctx.translate(w / 2 - this.camX * scale, groundY);
    ctx.scale(scale, scale);

    // кольца-подсветки под бойцами: свой — золотое, соперник — тусклое
    for (let i = 0; i < 2; i++) {
      const v = this.views[i];
      ctx.strokeStyle = i === this.myIdx ? 'rgba(255, 205, 90, 0.85)' : 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = i === this.myIdx ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.ellipse(v.x, 5, 56, 13, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // дальний боец рисуется первым (перекрытие ближним)
    const order = this.views[0].x <= this.views[1].x ? [0, 1] : [1, 0];
    for (const i of order) this.views[i].draw(ctx, t);

    fx.draw(ctx);

    ctx.restore();
  }
}
