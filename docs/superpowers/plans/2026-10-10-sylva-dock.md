# Sylva Dock extraction plan

**Source of truth:** `D:/2026大二上-前端开发/threeui-main/threeui-main/public/landing-pages/inner-green-3d.html`, read on 2026-10-10.

**Scope:** Only the top navigation. Keep seven Chinese labels, native anchors, existing panel routing, Chinese fonts, and all coastal background/content styles.

**Component:** A light-DOM `<sylva-dock>` custom element in `sylva-dock.js` and scoped `sylva-dock.css`. It owns animation and feedback, leaves navigation to the existing application, follows `aria-current`, and destroys listeners, observers, animations, frames and canvas resources on disconnect.

**Extracted source:** CSS `.dock-wrap`, `.dock`, `.dock-item`, near/active states and `[data-spec]` (lines 122–237); entrance (546–555); parallax (604–611, 1740–1785); `measureDock`, `drawDock`, `drawSpec`, `initDock` (1949–2128); particle pool/shader, `spawnSpray`, `burstAt` (3558–3655).

- [x] Add browser acceptance checks for neighboring magnification, still-pointer stability, shell height, specular tracking, click routing/pollen, keyboard ownership, touch/narrow viewports, reduced motion, and teardown; first demonstrate failure against the existing navigation.
- [x] Remove only the old navigation styles from `coastal.css`; add the custom element/classes/styles/scripts in `index.html`.
- [x] Port the original spring (190, exp(-23*dt)), distance smoothstep (128*u), dimensions and translateY; only recompute pointer targets on genuine coordinate changes. Read layout in animation frames. Re-measure after font loading and host resizing.
- [x] Reuse the original conic-gradient stops and edge mask, reach values, shortest-angle interpolation and brightness interpolation. Keep shell centering separate from dock parallax.
- [x] Reproduce shell fade and tile reveals (source easing; 120/180/230/280/330/380/430ms offsets), removing clip-path when complete.
- [x] Adapt the original 52-particle burst, 620-particle cap, 1.6s lifetime, boost=2.5, drag, lift, wander and fade to Canvas2D screen coordinates. No ambient forest particles or Three.js dependency.
- [x] Run existing routing/static checks and new acceptance checks; inspect screenshots; request independent code review and resolve material findings.

**Compatibility choices:** Base tile height is 44px (u=44/36), labels use the existing Chinese serif font at a stable 16px; narrow navigation scrolls internally with vertical room for magnification, keeping all labels and minimum 44px hit targets. Touch disables pointer effects but retains click pollen. Reduced motion disables all navigation animation and pollen. RequestAnimationFrame stops when the component settles.
