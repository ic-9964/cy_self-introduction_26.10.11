// A transparent, short-lived air-bubble trail; independent of navigation pollen.
(() => {
  const random = (min, max) => min + Math.random() * (max - min);
  const spacing = 7;
  const maxParticles = 180;
  const maxEmissions = 24;

  class CoastalBubbles extends HTMLElement {
    connectedCallback() {
      if (this.abort && !this.abort.signal.aborted) return;
      this.abort = new AbortController();
      this.particles = [];
      this.points = [];
      this.anchor = null;
      this.remainder = 0;
      this.frame = 0;
      this.needsResize = true;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
      this.fine = matchMedia('(hover: hover) and (pointer: fine)');
      this.canvas = document.createElement('canvas');
      this.append(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      if (!this.ctx) { this.canvas.remove(); return; }
      this.sprite = this.makeSprite();
      const listen = (target, type, handler) => target.addEventListener(type, handler, {
        passive: true, signal: this.abort.signal,
      });
      // Coordinate samples only: emission and drawing happen in the animation frame.
      listen(window, 'pointermove', event => {
        if (!this.enabled || event.pointerType === 'touch') return;
        const point = { x: event.clientX, y: event.clientY };
        const previous = this.points.at(-1) || this.anchor;
        if (previous && previous.x === point.x && previous.y === point.y) return;
        this.points.push(point);
        if (this.points.length > 32) this.points.shift();
        this.wake();
      });
      listen(document, 'pointerleave', () => this.resetPath());
      listen(window, 'scroll', () => this.resetPath());
      listen(window, 'blur', () => this.clear());
      listen(window, 'resize', () => { this.needsResize = true; if (this.enabled) this.wake(); });
      listen(document, 'visibilitychange', () => { if (document.hidden) this.clear(); });
      const preferenceChanged = () => { this.clear(); this.needsResize = true; };
      listen(this.reduced, 'change', preferenceChanged);
      listen(this.fine, 'change', preferenceChanged);
    }

    get enabled() { return !this.reduced.matches && this.fine.matches && !document.hidden; }

    makeSprite() {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 64;
      const ctx = sprite.getContext('2d');
      // A faint transparent interior, thin cool rim and asymmetric light reflection.
      const fill = ctx.createRadialGradient(23, 20, 2, 32, 32, 25);
      fill.addColorStop(0, 'rgba(245,255,255,.12)');
      fill.addColorStop(.65, 'rgba(206,246,255,.015)');
      fill.addColorStop(1, 'rgba(142,218,231,.14)');
      ctx.beginPath(); ctx.arc(32, 32, 24, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      const rim = ctx.createLinearGradient(12, 10, 48, 54);
      rim.addColorStop(0, 'rgba(255,255,255,.95)');
      rim.addColorStop(.5, 'rgba(189,242,252,.7)');
      rim.addColorStop(1, 'rgba(92,175,194,.45)');
      ctx.lineWidth = 2.5; ctx.strokeStyle = rim; ctx.stroke();
      ctx.beginPath(); ctx.arc(32, 32, 23.5, Math.PI * 1.08, Math.PI * 1.65);
      ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.94)'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(23, 21, 3.3, 1.6, -.65, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
      return sprite;
    }

    wake() {
      if (!this.frame && this.enabled && !this.abort.signal.aborted) {
        this.frame = requestAnimationFrame(time => this.paint(time));
      }
    }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.width = document.documentElement.clientWidth;
      this.height = innerHeight;
      this.canvas.width = Math.round(this.width * dpr);
      this.canvas.height = Math.round(this.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.needsResize = false;
    }

    spawn(x, y, time) {
      this.particles.push({
        x: x + random(-5, 5), y: y + random(-5, 5),
        radius: Math.random() < .18 ? random(3.2, 4.2) : random(1.5, 3),
        vx: random(-4, 4), rise: random(13, 25), sway: random(1, 3.5),
        phase: random(0, Math.PI * 2), opacity: random(.65, .95),
        birth: time, life: random(1.2, 2.2),
      });
    }

    emitPath(time) {
      const points = this.points.splice(0);
      if (!points.length) return;
      if (!this.anchor) {
        this.anchor = points.shift();
        this.spawn(this.anchor.x, this.anchor.y, time);
      }
      let previous = this.anchor, total = 0;
      const segments = points.map(point => {
        const segment = { from: previous, to: point, length: Math.hypot(point.x - previous.x, point.y - previous.y) };
        total += segment.length; previous = point;
        return segment;
      });
      const needed = Math.floor((this.remainder + total) / spacing);
      const count = Math.min(maxEmissions, needed);
      // Even sampling keeps fast movements continuous without flooding the screen.
      const step = needed > maxEmissions ? total / maxEmissions : spacing;
      let next = needed > maxEmissions ? step * .5 : spacing - this.remainder;
      let traversed = 0, emitted = 0;
      for (const segment of segments) {
        while (segment.length > 0 && next <= traversed + segment.length && emitted < count) {
          const t = (next - traversed) / segment.length;
          this.spawn(segment.from.x + (segment.to.x - segment.from.x) * t,
            segment.from.y + (segment.to.y - segment.from.y) * t, time);
          emitted++; next += step;
        }
        traversed += segment.length;
      }
      this.anchor = previous;
      this.remainder = needed > maxEmissions ? 0 : (this.remainder + total) % spacing;
      if (this.particles.length > maxParticles) this.particles.splice(0, this.particles.length - maxParticles);
    }

    paint(milliseconds) {
      this.frame = 0;
      if (!this.enabled || this.abort.signal.aborted) { this.clear(); return; }
      if (this.needsResize) this.resize();
      const time = milliseconds / 1000;
      this.emitPath(time);
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.particles = this.particles.filter(p => time - p.birth < p.life);
      for (const p of this.particles) {
        const age = time - p.birth, progress = age / p.life;
        const x = p.x + p.vx * age + (Math.sin(p.phase + age * 1.8) - Math.sin(p.phase)) * p.sway;
        const y = p.y - p.rise * age;
        const diameter = p.radius * 2.56 * (1 + .12 * progress);
        this.ctx.globalAlpha = p.opacity * Math.min(age / .065, 1) * Math.pow(1 - progress, 1.35);
        this.ctx.drawImage(this.sprite, x - diameter / 2, y - diameter / 2, diameter, diameter);
      }
      this.ctx.globalAlpha = 1;
      if (this.particles.length || this.points.length) this.wake();
    }

    resetPath() { this.points.length = 0; this.anchor = null; this.remainder = 0; }

    clear() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.resetPath();
      this.particles.length = 0;
      this.ctx?.clearRect(0, 0, this.width || 0, this.height || 0);
    }

    disconnectedCallback() {
      this.abort?.abort();
      this.clear();
      this.canvas?.remove();
      this.ctx = this.sprite = null;
    }
  }
  if (!customElements.get('coastal-bubbles')) customElements.define('coastal-bubbles', CoastalBubbles);
})();
