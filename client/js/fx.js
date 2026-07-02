// Визуальные эффекты: частицы-искры, ударная волна, screen shake, hit-stop.

export const fx = {
  particles: [],
  rings: [],
  shake: 0,
  freezeUntil: 0,

  // Вспышка/искры в точке удара (мировые координаты).
  burst(x, y, power = 1) {
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

  addShake(m) { this.shake = Math.min(26, this.shake + m); },

  hitStop(ms) { this.freezeUntil = Math.max(this.freezeUntil, performance.now() + ms); },

  get frozen() { return performance.now() < this.freezeUntil; },

  update(dt) {
    this.shake *= Math.pow(0.0005, dt);
    if (this.shake < 0.3) this.shake = 0;
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
    this.shake = 0;
    this.freezeUntil = 0;
  },
};
