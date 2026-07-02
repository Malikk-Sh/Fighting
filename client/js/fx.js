// Визуальные эффекты: спрайтовые чернильные анимации (assets/fx) с откатом
// на процедурные частицы, ударная волна, screen shake, hit-stop.

import { fxImgs } from './sprites.js';

const FX_FRAMES = 8; // листы 4x2

export const fx = {
  particles: [],
  rings: [],
  anims: [],
  shake: 0,
  freezeUntil: 0,

  // Вспышка/искры в точке удара (мировые координаты).
  burst(x, y, power = 1) {
    if (fxImgs.ready) {
      this.anims.push({
        kind: 'burst', x, y,
        age: 0, dur: 0.5,
        size: 240 * power,
        flip: Math.random() < 0.5 ? -1 : 1,
      });
      return;
    }
    const n = Math.round(16 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (140 + Math.random() * 420) * power;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 0.35 + Math.random() * 0.3,
        age: 0,
        size: 2.5 + Math.random() * 4,
        hue: Math.random() < 0.25 ? 40 : Math.random() * 12, // красные чернила + редкие белые искры
        white: Math.random() < 0.25,
      });
    }
    this.rings.push({ x, y, age: 0, life: 0.28, power });
  },

  // Дуга удара за клинком (в момент фазы strike).
  slash(x, y, facing) {
    if (!fxImgs.ready) return; // без ассетов достаточно следа в спрайте бойца
    this.anims.push({
      kind: 'slash', x, y,
      age: 0, dur: 0.45,
      size: 340,
      flip: -facing, // выпуклость дуги — в сторону удара
    });
  },

  addShake(m) { this.shake = Math.min(26, this.shake + m); },

  hitStop(ms) { this.freezeUntil = Math.max(this.freezeUntil, performance.now() + ms); },

  get frozen() { return performance.now() < this.freezeUntil; },

  update(dt) {
    this.shake *= Math.pow(0.0005, dt);
    if (this.shake < 0.3) this.shake = 0;
    for (let i = this.anims.length - 1; i >= 0; i--) {
      this.anims[i].age += dt;
      if (this.anims[i].age >= this.anims[i].dur) this.anims.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt; // гравитация
      p.vx *= Math.pow(0.2, dt);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].age += dt;
      if (this.rings[i].age >= this.rings[i].life) this.rings.splice(i, 1);
    }
  },

  shakeOffset() {
    if (this.shake <= 0) return [0, 0];
    return [
      (Math.random() * 2 - 1) * this.shake,
      (Math.random() * 2 - 1) * this.shake * 0.7,
    ];
  },

  // Рисуется в мировых координатах (после установки камеры).
  draw(ctx) {
    for (const a of this.anims) {
      const img = fxImgs.imgs[a.kind];
      const frame = Math.min(FX_FRAMES - 1, Math.floor((a.age / a.dur) * FX_FRAMES));
      const cw = img.width / 4;
      const ch = img.height / 2;
      const dw = a.size;
      const dh = a.size * (ch / cw);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.scale(a.flip, 1);
      ctx.drawImage(img, (frame % 4) * cw, Math.floor(frame / 4) * ch, cw, ch, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
    for (const r of this.rings) {
      const t = r.age / r.life;
      const rad = 12 + t * 90 * r.power;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.strokeStyle = '#ffe9b0';
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      if (t < 0.4) {
        ctx.globalAlpha = (1 - t / 0.4) * 0.85;
        ctx.fillStyle = '#fff7dd';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 26 * (1 - t / 0.4) * r.power, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const p of this.particles) {
      const t = p.age / p.life;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.white
        ? `hsl(40, 30%, ${95 - t * 20}%)`
        : `hsl(${p.hue}, 90%, ${52 - t * 22}%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  reset() {
    this.particles.length = 0;
    this.rings.length = 0;
    this.anims.length = 0;
    this.shake = 0;
    this.freezeUntil = 0;
  },
};
