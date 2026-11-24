// Touch / small-screen layer: a left-thumb steering stick (push toward where you want
// the bow to point; how far you push is the throttle), a compact ability pad, a menu
// sheet instead of the button bar, chat behind a toggle. Also the "hide interface during
// autoplay" mode used on every device.
import * as THREE from 'three/webgpu';

export function isTouch() {
  return matchMedia('(pointer: coarse)').matches || innerWidth < 900 || new URLSearchParams(location.search).has('mobile');
}

export function installMobile(game) {
  const ui = game.ui;
  const root = document.getElementById('ui');
  const apply = () => document.body.classList.toggle('mobile', isTouch());
  apply(); addEventListener('resize', apply);

  // --- steering stick ---
  root.insertAdjacentHTML('beforeend', `
    <div id="stick"><div class="ring"></div><div class="knob"></div></div>
    <button id="mMenu" class="mbtn" aria-label="Menu">☰</button>
    <button id="mChat" class="mbtn" aria-label="Chat">💬</button>
    <button id="mAuto" class="mbtn auto" aria-label="Autoplay">AUTO</button>
    <button id="mStop" class="mbtn" aria-label="All stop">■</button>
    <div id="hudPeek"><span id="peekTxt"></span><button class="btn" id="peekShow">Show interface</button><button class="btn bad" id="peekStop">Stop autoplay</button></div>`);
  const stick = document.getElementById('stick'), knob = stick.querySelector('.knob');
  const S = (game.stick = { x: 0, y: 0, active: false, id: null });
  const R = 52;
  const move = (t) => {
    const r = stick.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    S.x = dx / R; S.y = -dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; S.active = true; S.id = t.identifier; move(t); e.preventDefault(); }, { passive: false });
  stick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === S.id) move(t); e.preventDefault(); }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === S.id) { S.active = false; S.x = S.y = 0; knob.style.transform = ''; } };
  stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);

  document.getElementById('mMenu').onclick = () => document.getElementById('menubar').classList.toggle('open');
  document.getElementById('menubar').addEventListener('click', () => { if (document.body.classList.contains('mobile')) document.getElementById('menubar').classList.remove('open'); });
  document.getElementById('mChat').onclick = () => document.getElementById('chat').classList.toggle('open');
  document.getElementById('mAuto').onclick = () => game.command('auto');
  document.getElementById('mStop').onclick = () => { if (game.player) { game.player.throttle = 0; game.moveTarget = null; } };
  // add System map + Dock to the menu sheet (they have hotkeys on desktop)
  const bar = document.getElementById('menubar');
  bar.insertAdjacentHTML('beforeend', '<button data-w="systemMap" class="monly">SYSTEM</button><button data-w="dock" class="monly">DOCK</button>');
  bar.querySelectorAll('.monly').forEach((b) => b.addEventListener('click', () => game.command(b.dataset.w)));

  // --- hide interface during autoplay ---
  let peekUntil = 0;
  document.getElementById('peekShow').onclick = () => { peekUntil = performance.now() + 20000; };
  document.getElementById('peekStop').onclick = () => { if (game.autoplay) game.toggleAutoplay(); };
  // tapping the screen while hidden peeks the interface for a few seconds
  addEventListener('pointerdown', (e) => { if (game.hudHidden && e.target.id === 'view') peekUntil = performance.now() + 6000; });

  game.engine.add({
    update() {
      const s = game.settings();
      const hide = !!(game.autoplay && s.hideHudInAuto && performance.now() > peekUntil && game.mode === 'space');
      if (hide !== game.hudHidden) {
        game.hudHidden = hide;
        document.body.classList.toggle('hud-hidden', hide);
        if (hide) ui.closeAll();
      }
      document.getElementById('mAuto').classList.toggle('on', !!game.autoplay);
      if (hide) {
        const p = game.player, P = game.data;
        const st = document.getElementById('autoStatus').textContent.replace('AUTOPLAY · ', ''), hull = p ? Math.round(p.hull / p.maxHull * 100) : 0;
        // one line on phones: the short form
        const txt = innerWidth < 700 ? `AUTO · ${st} · R${P.level} · ${hull}%` : `AUTOPLAY · ${st} · Rank ${P.level} · Hull ${hull}% · ${Math.round(P.credits).toLocaleString()} ¢`;
        const el = document.getElementById('peekTxt'); if (el.textContent !== txt) el.textContent = txt;
      }
    },
  });
}

// camera-relative stick -> desired heading + throttle (called from the helm)
const _r = new THREE.Vector3(), _f = new THREE.Vector3();
export function stickHeading(game) {
  const S = game.stick;
  if (!S || !S.active) return null;
  const mag = Math.min(1, Math.hypot(S.x, S.y));
  if (mag < 0.18) return { heading: null, throttle: 0 };
  const y = game.cam.yaw;
  _f.set(-Math.sin(y), 0, -Math.cos(y)); _r.set(Math.cos(y), 0, -Math.sin(y));
  const dx = _r.x * S.x + _f.x * S.y, dz = _r.z * S.x + _f.z * S.y;
  return { heading: Math.atan2(dx, dz), throttle: mag };
}
