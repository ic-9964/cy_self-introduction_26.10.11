/* Standalone port of Sylva's Dock UI and click spray. Native links keep their
   navigation behavior; aria-current is the application's source of truth.
   Reuse: <sylva-dock class="dock-wrap"><div class="dock-viewport">
           <nav class="dock" data-spec><a class="dock-item" data-spec href="…">…</a></nav>
          </div></sylva-dock>. Disconnecting the element releases all resources. */
(() => {
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const smoothstep = value => value * value * (3 - 2 * value);
  const random = (low, high) => low + Math.random() * (high - low);
  const tau = Math.PI * 2;
  const shortestAngle = delta => ((delta + Math.PI) % tau + tau) % tau - Math.PI;

  class SylvaDock extends HTMLElement {
    connectedCallback() {
      if (this.abort && !this.destroyed) return;
      this.initDock();
    }

    disconnectedCallback() { this.destroy(); }

    initDock() {
      this.dock = this.querySelector('.dock');
      if (!this.dock) return;
      this.destroyed = false;
      this.abort = new AbortController();
      const signal = this.abort.signal;
      this.frame = 0;
      this.unit = 44 / 36;
      this.items = [...this.dock.querySelectorAll('.dock-item')].map(el => ({
        el, baseWidth: 0, baseHeight: 0, value: 0, velocity: 0, target: 0,
      }));
      this.specItems = [this.dock, ...this.items.map(st => st.el)].map(el => ({
        el, angle: 2.4, targetAngle: 2.4, brightness: 0, targetBrightness: 0,
        reach: el === this.dock ? 250 : 185,
      }));
      this.pointer = { x: 0, y: 0, valid: false, moved: false, type: 'mouse' };
      this.parallax = { x: 0, y: 0, targetX: 0, targetY: 0 };
      this.controlMode = 'pointer';
      this.focusDirty = false;
      this.needsMeasure = true;
      this.pendingBursts = [];
      this.particles = [];
      this.canvas = null;
      this.context = null;
      this.introDone = false;
      this.introAnimations = new Set();
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
      this.fine = matchMedia('(hover: hover) and (pointer: fine)');
      const listen = (target, event, handler, options = {}) => {
        target.addEventListener(event, handler, { ...options, signal: this.abort.signal });
      };

      // No layout reads, target calculations or style writes in pointermove.
      listen(window, 'pointermove', event => {
        if (event.pointerType === 'touch' || this.reduced.matches || !this.fine.matches) return;
        if (this.pointer.valid && this.pointer.x === event.clientX && this.pointer.y === event.clientY) return;
        this.pointer.x = event.clientX;
        this.pointer.y = event.clientY;
        this.pointer.valid = true;
        this.pointer.moved = true;
        this.pointer.type = event.pointerType;
        this.controlMode = 'pointer';
        this.wake();
      }, { passive: true });
      listen(document, 'pointerleave', () => {
        this.pointer.valid = false;
        this.pointer.moved = true;
        this.wake();
      }, { passive: true });
      listen(window, 'blur', () => {
        this.pointer.valid = false;
        this.pointer.moved = true;
        this.wake();
      });
      listen(document, 'pointerdown', event => {
        this.controlMode = 'pointer';
        this.pointer.type = event.pointerType;
        if (event.pointerType === 'touch') {
          this.pointer.valid = false;
          this.pointer.moved = true;
        }
        this.focusDirty = true;
        this.wake();
      }, { passive: true });
      listen(document, 'keydown', event => {
        if (['Tab', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) {
          this.controlMode = 'keyboard';
          this.focusDirty = true;
          this.wake();
        }
      }, { capture: true });
      listen(this.dock, 'focusin', () => { this.focusDirty = true; this.wake(); });
      listen(this.dock, 'focusout', () => { this.focusDirty = true; this.wake(); });
      listen(this.dock, 'click', event => {
        const item = event.target.closest('.dock-item');
        if (!item || !this.dock.contains(item) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        this.setActive(item, true);
        if (!this.reduced.matches) {
          this.pendingBursts.push({ item, x: event.clientX, y: event.clientY, keyboard: event.detail === 0 });
          this.wake();
        }
        // Do not preventDefault: the app's existing router owns the click.
      });
      const remeasure = () => {
        this.needsMeasure = true;
        if (this.reduced.matches) {
          this.cancelIntro();
          this.pendingBursts.length = this.particles.length = 0;
          this.context?.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        }
        this.wake();
      };
      listen(window, 'resize', remeasure, { passive: true });
      listen(this.reduced, 'change', remeasure);
      listen(this.fine, 'change', remeasure);
      this.sizeObserver = new ResizeObserver(remeasure);
      // Observe the stable outer wrapper, never the items whose widths we animate.
      this.sizeObserver.observe(this);
      this.routeObserver = new MutationObserver(() => this.syncActive());
      this.routeObserver.observe(this.dock, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
      document.fonts?.ready.then(() => { if (!signal.aborted) remeasure(); });
      if (document.fonts) listen(document.fonts, 'loadingdone', remeasure);
      this.syncActive();
      this.wake();
    }

    setActive(item, publish = false) {
      this.items.forEach(st => {
        const selected = st.el === item;
        st.el.classList.toggle('is-active', selected);
        if (publish) {
          if (selected) st.el.setAttribute('aria-current', 'page');
          else st.el.removeAttribute('aria-current');
        }
      });
    }

    syncActive() {
      this.setActive(this.items.find(st => st.el.getAttribute('aria-current') && st.el.getAttribute('aria-current') !== 'false')?.el || this.items[0]?.el);
    }

    get hoverEnabled() {
      return !this.reduced.matches && this.fine.matches && this.pointer.type !== 'touch';
    }

    wake() {
      if (this.destroyed || this.frame) return;
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame(time => this.tick(time));
    }

    measureDock() {
      for (const st of this.items) {
        st.el.style.width = st.el.style.height = st.el.style.transform = '';
        st.el.dataset.near = 'false';
        st.value = st.velocity = st.target = 0;
      }
      for (const st of this.items) {
        const rect = st.el.getBoundingClientRect();
        st.baseWidth = rect.width;
        st.baseHeight = rect.height;
      }
      this.unit = (this.items[0]?.baseHeight || 44) / 36;
      this.needsMeasure = false;
      this.focusDirty = true;
      this.pointer.moved = this.pointer.valid;
      this.resizeCanvas();
      if (!this.startedIntro) { this.startedIntro = true; this.startIntro(); }
    }

    dockRest() {
      for (const st of this.items) {
        st.target = 0;
        st.el.dataset.near = 'false';
      }
    }

    readTargets() {
      if (!this.pointer.moved && !this.focusDirty) return;
      const focusedIndex = this.controlMode === 'keyboard'
        ? this.items.findIndex(st => st.el === document.activeElement) : -1;
      const keyboard = focusedIndex >= 0 && !this.reduced.matches;
      // Read every needed rectangle before drawDock/drawSpec write any styles.
      const shell = this.dock.getBoundingClientRect();
      const rectangles = this.items.map(st => st.el.getBoundingClientRect());
      if (keyboard) {
        this.items.forEach((st, i) => {
          st.target = i === focusedIndex ? 1 : Math.abs(i - focusedIndex) === 1 ? .24 : 0;
          st.el.dataset.near = st.target > .08 ? 'true' : 'false';
        });
      } else if (this.pointer.moved) {
        const { x, y } = this.pointer;
        const nearDock = this.hoverEnabled && this.pointer.valid &&
          x > shell.left - 48 && x < shell.right + 48 && y > shell.top - 44 && y < shell.bottom + 104;
        if (nearDock) {
          this.items.forEach((st, i) => {
            const rect = rectangles[i];
            const p = clamp(1 - Math.abs(x - (rect.left + rect.width * .5)) / (128 * this.unit));
            st.target = smoothstep(p);
            st.el.dataset.near = st.target > .08 ? 'true' : 'false';
          });
        } else this.dockRest();
      } else if (this.focusDirty) this.dockRest();

      this.specItems.forEach((st, i) => {
        if (keyboard) {
          st.targetBrightness = this.hoverEnabled && (i === 0 || i - 1 === focusedIndex) ? .9 : 0;
          return;
        }
        if (!this.hoverEnabled || !this.pointer.valid || !this.pointer.moved) {
          st.targetBrightness = 0;
          return;
        }
        const rect = i === 0 ? shell : rectangles[i - 1];
        const cx = rect.left + rect.width * .5, cy = rect.top + rect.height * .5;
        const dx = Math.max(rect.left - this.pointer.x, 0, this.pointer.x - rect.right);
        const dy = Math.max(rect.top - this.pointer.y, 0, this.pointer.y - rect.bottom);
        const distance = Math.hypot(dx, dy);
        st.targetAngle = distance === 0
          ? Math.atan2(2 / Math.max(rect.height, 1), -2 / Math.max(rect.width, 1)) +
            ((this.pointer.x - cx) / Math.max(rect.width * .5, 1)) * .30 +
            ((cy - this.pointer.y) / Math.max(rect.height * .5, 1)) * .15
          : Math.atan2(cy - this.pointer.y, this.pointer.x - cx);
        st.targetBrightness = smoothstep(clamp(1 - distance / (st.reach * this.unit)));
      });
      const par = this.hoverEnabled && this.pointer.valid && this.controlMode !== 'keyboard';
      this.parallax.targetX = par ? clamp(this.pointer.x / innerWidth * 2 - 1, -1, 1) : 0;
      this.parallax.targetY = par ? clamp(this.pointer.y / innerHeight * 2 - 1, -1, 1) : 0;
      this.pointer.moved = this.focusDirty = false;
    }

    drawDock(dt) {
      let moving = false;
      for (const st of this.items) {
        if (this.reduced.matches) { st.value = st.velocity = st.target = 0; }
        else {
          st.velocity += (st.target - st.value) * 190 * dt;
          st.velocity *= Math.exp(-23 * dt);
          st.value += st.velocity * dt;
          if (Math.abs(st.target - st.value) < .001 && Math.abs(st.velocity) < .004) {
            st.value = st.target; st.velocity = 0;
          } else moving = true;
        }
        const v = clamp(st.value, 0, 1.08);
        st.el.style.width = `${(st.baseWidth + Math.min(18 * this.unit, st.baseWidth * .24) * v).toFixed(3)}px`;
        st.el.style.height = `${(st.baseHeight + 16 * this.unit * v).toFixed(3)}px`;
        st.el.style.transform = v ? `translateY(${(3.5 * this.unit * v).toFixed(3)}px)` : '';
      }
      return moving;
    }

    drawSpec(dt) {
      let moving = false;
      for (const st of this.specItems) {
        if (this.reduced.matches || !this.hoverEnabled) st.brightness = st.targetBrightness = 0;
        const delta = shortestAngle(st.targetAngle - st.angle);
        st.angle += delta * (1 - Math.exp(-8 * dt));
        st.brightness += (st.targetBrightness - st.brightness) * (1 - Math.exp(-9 * dt));
        if (Math.abs(delta) < .001 && Math.abs(st.targetBrightness - st.brightness) < .002) {
          st.angle = st.targetAngle; st.brightness = st.targetBrightness;
        } else moving = true;
        st.el.style.setProperty('--spec-angle', `${st.angle.toFixed(4)}rad`);
        st.el.style.setProperty('--spec-bright', (clamp(st.brightness) * .92).toFixed(3));
      }
      return moving;
    }

    drawParallax(dt) {
      const state = this.parallax;
      if (this.reduced.matches || !this.hoverEnabled) state.x = state.y = state.targetX = state.targetY = 0;
      state.x += (state.targetX - state.x) * (1 - Math.exp(-3.4 * dt));
      state.y += (state.targetY - state.y) * (1 - Math.exp(-3.4 * dt));
      const moving = Math.abs(state.targetX - state.x) > .0005 || Math.abs(state.targetY - state.y) > .0005;
      if (!moving) { state.x = state.targetX; state.y = state.targetY; }
      this.dock.style.transform = state.x || state.y
        ? `translate3d(${(-state.x * 5).toFixed(3)}px,${(-state.y * 3.1).toFixed(3)}px,0)` : '';
      return moving;
    }

    startIntro() {
      if (this.reduced.matches) { this.introDone = true; return; }
      const signal = this.abort.signal;
      const animations = this.introAnimations;
      const track = animation => {
        animations.add(animation);
        return animation.finished.catch(() => {}).then(() => {
          animation.cancel(); animations.delete(animation);
        });
      };
      const jobs = [track(this.dock.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 800, delay: 80, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both',
      }))];
      this.items.forEach((st, i) => jobs.push(track(st.el.animate([
        { clipPath: 'inset(0 0 105% 0)' }, { clipPath: 'inset(0 0 -30% 0)' },
      ], { duration: 900, delay: i === 0 ? 120 : 130 + i * 50,
        easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }))));
      Promise.all(jobs).then(() => { if (!signal.aborted) this.introDone = true; });
    }

    cancelIntro() {
      this.introAnimations?.forEach(animation => animation.cancel());
      this.introAnimations?.clear();
      this.introDone = true;
    }

    ensureCanvas() {
      if (this.canvas || this.reduced.matches) return;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'sylva-dock-pollen';
      this.canvas.setAttribute('aria-hidden', 'true');
      document.body.append(this.canvas);
      this.context = this.canvas.getContext('2d');
      this.sprite = document.createElement('canvas');
      this.sprite.width = this.sprite.height = 64;
      const ctx = this.sprite.getContext('2d');
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(.35, 'rgba(236,244,224,.5)');
      gradient.addColorStop(1, 'rgba(236,244,224,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      this.resizeCanvas();
    }

    resizeCanvas() {
      if (!this.canvas || !this.context) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvasWidth = document.documentElement.clientWidth;
      this.canvasHeight = innerHeight;
      this.canvas.width = Math.round(this.canvasWidth * dpr);
      this.canvas.height = Math.round(this.canvasHeight * dpr);
      this.canvas.style.width = `${this.canvasWidth}px`;
      this.canvas.style.height = `${this.canvasHeight}px`;
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    burstAt(x, y, time) {
      if (this.reduced.matches) return;
      this.ensureCanvas();
      if (!this.context) return;
      // Source spawnSpray(boost=2.5), projected from world units to CSS pixels.
      const boost = 2.5, projection = .38 * this.unit;
      for (let i = 0; i < 52; i++) this.particles.push({
        x: x + random(-15, 15) * boost * projection,
        y: y - random(-15, 15) * boost * projection,
        vx: random(-38, 38) * boost * projection,
        vy: -(random(2, 64) + 22 * (boost - 1)) * boost * projection,
        size: random(.50, 1.15), phase: Math.random(), birth: time,
      });
      if (this.particles.length > 620) this.particles.splice(0, this.particles.length - 620);
    }

    drawPollen(time) {
      if (!this.context) return false;
      this.context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.particles = this.particles.filter(particle => time - particle.birth < 1.6);
      const ctx = this.context, projection = .38 * this.unit;
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        const age = time - p.birth, u = age / 1.6;
        const x = p.x + p.vx * age * (1 - .34 * u) + Math.sin(p.phase * 6.28 + age * 2.6) * 22 * u * projection;
        const y = p.y + p.vy * age * (1 - .34 * u) - 46 * age * projection;
        const radius = 2.6 * this.unit * p.size * (.45 + .55 * (1 - u));
        ctx.globalAlpha = smoothstep(clamp(u / .09)) * (1 - smoothstep(clamp((u - .40) / .60))) * .85;
        ctx.drawImage(this.sprite, x - radius, y - radius, radius * 2, radius * 2);
      }
      ctx.globalAlpha = 1;
      return this.particles.length > 0;
    }

    tick(time) {
      this.frame = 0;
      if (this.destroyed) return;
      const dt = Math.min((time - this.lastTime) / 1000, .05);
      this.lastTime = time;
      if (this.needsMeasure) this.measureDock();
      this.readTargets();
      const bursts = this.pendingBursts.splice(0).map(burst => {
        const rect = burst.keyboard ? burst.item.getBoundingClientRect() : null;
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : burst;
      });
      const dockMoving = this.drawDock(dt);
      const specMoving = this.drawSpec(dt);
      const parallaxMoving = this.drawParallax(dt);
      bursts.forEach(burst => this.burstAt(burst.x, burst.y, time / 1000));
      const pollenMoving = this.drawPollen(time / 1000);
      if (dockMoving || specMoving || parallaxMoving || pollenMoving) this.frame = requestAnimationFrame(next => this.tick(next));
    }

    destroy() {
      this.destroyed = true;
      this.abort?.abort();
      this.sizeObserver?.disconnect();
      this.routeObserver?.disconnect();
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.cancelIntro();
      this.canvas?.remove();
      this.canvas = this.context = this.sprite = null;
      this.pendingBursts = [];
      this.particles = [];
      this.items?.forEach(st => {
        st.el.style.width = st.el.style.height = st.el.style.transform = '';
        st.el.dataset.near = 'false';
      });
      this.specItems?.forEach(st => {
        st.el.style.removeProperty('--spec-angle');
        st.el.style.removeProperty('--spec-bright');
      });
      if (this.dock) this.dock.style.transform = '';
      this.startedIntro = false;
    }
  }

  if (!customElements.get('sylva-dock')) customElements.define('sylva-dock', SylvaDock);
})();

