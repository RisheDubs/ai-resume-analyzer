/* Meteor cursor with a fire trail. Fine pointers only; touch devices keep their normal behaviour.
   API: window.MeteorCursor.set("off" | "orange" | "blue" | "pink"), .get() */
(function () {
  const FINE = matchMedia("(pointer: fine)").matches;
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FOLLOW = 0.32, HOVER_SCALE = 1.7, TRAIL_LEN = 26, MAX_EMBERS = 160;
  const HOVER_SEL = 'a, button, [role="button"], [role="menuitemradio"], label, summary, select, .btn, [data-cursor="hover"], input[type="submit"], input[type="checkbox"], input[type="radio"]';
  const TEXT_SEL = 'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]';

  // Each palette: trail stops (hot -> cooled), head glow stops, rock shading stops
  const PALETTES = {
    orange: { stops: [[255, 248, 225], [255, 196, 92], [255, 112, 52], [214, 58, 78], [124, 72, 220]],
      glow: ["255,236,190", "255,150,70", "200,70,120"], rock: ["#fff3d6", "#ffad5c", "#7a3b5c", "#2a1840"] },
    blue: { stops: [[238, 250, 255], [150, 215, 255], [72, 146, 255], [64, 84, 226], [116, 74, 222]],
      glow: ["225,245,255", "110,180,255", "70,90,230"], rock: ["#f1faff", "#86c8ff", "#2d447e", "#141a40"] },
    pink: { stops: [[255, 242, 250], [255, 176, 222], [255, 92, 172], [204, 52, 152], [124, 62, 214]],
      glow: ["255,232,246", "255,120,196", "190,60,170"], rock: ["#fff0fa", "#ff92d2", "#7a2b5f", "#2a1036"] },
  };
  const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  let mode = read("cursorStyle", "orange");
  if (mode !== "off" && !PALETTES[mode]) mode = "orange";
  let pal = PALETTES[mode] || PALETTES.orange;

  const api = { get: () => mode, set() {}, palettes: Object.keys(PALETTES), supported: FINE };
  window.MeteorCursor = api;
  if (!FINE) { api.set = (m) => { mode = m; write("cursorStyle", m); }; return; }

  const style = document.createElement("style");
  style.textContent = `
    html.meteor-on, html.meteor-on * { cursor: none !important; }
    html.meteor-on ${TEXT_SEL.split(", ").join(", html.meteor-on ")} { cursor: text !important; }
    #meteor-cursor { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483000; }`;
  document.head.appendChild(style);

  const cv = document.createElement("canvas");
  cv.id = "meteor-cursor"; cv.setAttribute("aria-hidden", "true");
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", size);

  const ROCK = Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2; return [Math.cos(a), Math.sin(a), 0.78 + ((i * 37) % 10) / 40]; });
  let mx = -100, my = -100, x = -100, y = -100, vx = 0, vy = 0, visible = false, hover = 0, hoverT = 0, rot = 0;
  const trail = [], embers = [];
  let raf = 0, last = performance.now(), started = false;

  function emit(n, speedScale, burst) {
    for (let i = 0; i < n && embers.length < MAX_EMBERS; i++) {
      const ang = burst ? Math.random() * Math.PI * 2 : Math.atan2(-vy, -vx) + (Math.random() - 0.5) * 1.1;
      const sp = (burst ? 90 + Math.random() * 160 : 20 + Math.random() * 60) * speedScale;
      embers.push({ x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (burst ? 0 : 10),
        life: 0, max: 0.35 + Math.random() * (burst ? 0.5 : 0.45), r: 0.9 + Math.random() * (burst ? 2.2 : 1.8) });
    }
  }
  function color(t, a) {
    const st = pal.stops, f = Math.min(0.999, Math.max(0, t)) * (st.length - 1), i = Math.floor(f), k = f - i;
    const c = st[i].map((v, j) => Math.round(v + (st[i + 1][j] - v) * k));
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const px = x, py = y, f = 1 - Math.pow(1 - FOLLOW, dt * 60);
    x += (mx - x) * f; y += (my - y) * f;
    vx = (x - px) / Math.max(dt, 0.001); vy = (y - py) / Math.max(dt, 0.001);
    const speed = Math.hypot(vx, vy);
    hover += (hoverT - hover) * Math.min(1, dt * 14);
    rot += dt * (0.8 + speed * 0.004);
    trail.unshift([x, y]); if (trail.length > TRAIL_LEN) trail.pop();
    if (!REDUCED && visible && speed > 40) emit(Math.min(6, Math.floor(speed / 260) + 1), Math.min(1.6, 0.6 + speed / 1400), false);

    ctx.clearRect(0, 0, W, H);
    // fire streak: soft outer glow, then a hot tapered core
    if (!REDUCED && trail.length > 2 && visible) {
      ctx.lineCap = "butt"; ctx.lineJoin = "round";
      for (const pass of [[2.6, 0.2], [1, 0.85]]) {
        for (let i = trail.length - 1; i > 0; i--) {
          const t = i / trail.length, [ax, ay] = trail[i], [bx, by] = trail[i - 1];
          if (Math.hypot(ax - bx, ay - by) < 0.15) continue;
          ctx.strokeStyle = color(t * 1.05, (1 - t) * pass[1]);
          ctx.lineWidth = ((1 - t) * (6 + hover * 4) + 0.6) * pass[0];
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
      }
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i]; e.life += dt;
      if (e.life >= e.max) { embers.splice(i, 1); continue; }
      const t = e.life / e.max;
      e.vx *= 1 - dt * 2.2; e.vy = e.vy * (1 - dt * 2.2) - 18 * dt; e.x += e.vx * dt; e.y += e.vy * dt;
      ctx.fillStyle = color(0.15 + t * 0.85, (1 - t) * 0.95);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 - t * 0.6), 0, Math.PI * 2); ctx.fill();
    }
    if (visible) {
      const s = 1 + hover * (HOVER_SCALE - 1), gr = 13 * s + Math.min(6, speed / 300), G = pal.glow;
      const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
      g.addColorStop(0, `rgba(${G[0]},0.95)`); g.addColorStop(0.3, `rgba(${G[1]},0.55)`); g.addColorStop(0.65, `rgba(${G[2]},0.2)`); g.addColorStop(1, `rgba(${G[2]},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
      const R = 4.2 * s, dir = speed > 20 ? Math.atan2(vy, vx) : -Math.PI / 4, K = pal.rock;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.beginPath();
      ROCK.forEach(([cx, cy, k], i) => { const a = cx * R * k, b = cy * R * k; i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
      ctx.closePath();
      const lx = Math.cos(dir - rot) * R, ly = Math.sin(dir - rot) * R;
      const rg = ctx.createRadialGradient(lx * 0.7, ly * 0.7, 0, 0, 0, R * 1.5);
      rg.addColorStop(0, K[0]); rg.addColorStop(0.35, K[1]); rg.addColorStop(0.7, K[2]); rg.addColorStop(1, K[3]);
      ctx.fillStyle = rg; ctx.fill();
      ctx.restore();
    }
    const settled = Math.hypot(mx - x, my - y) < 0.3 && embers.length === 0 && Math.abs(hoverT - hover) < 0.01;
    if (settled) { trail.length = 0; raf = 0; } else raf = requestAnimationFrame(frame);
  }
  function kick() { if (mode !== "off" && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function onMove(e) {
    mx = e.clientX; my = e.clientY;
    if (!visible) { visible = true; x = mx; y = my; trail.length = 0; }
    const el = e.target instanceof Element ? e.target : null;
    cv.style.opacity = el && el.closest(TEXT_SEL) ? "0" : "1";
    hoverT = el && el.closest(HOVER_SEL) ? 1 : 0;
    kick();
  }
  function apply() {
    const on = mode !== "off";
    document.documentElement.classList.toggle("meteor-on", on);
    cv.style.display = on ? "block" : "none";
    if (!on) { cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, W, H); embers.length = 0; trail.length = 0; }
    else { pal = PALETTES[mode]; kick(); }
  }
  api.set = (m) => {
    if (m !== "off" && !PALETTES[m]) return;
    mode = m; write("cursorStyle", m);
    if (started) apply();
    document.dispatchEvent(new CustomEvent("cursorchange", { detail: m }));
  };
  function start() {
    started = true;
    document.body.appendChild(cv); size();
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" || REDUCED || mode === "off") return; mx = e.clientX; my = e.clientY; emit(26, 1, true); kick(); });
    document.addEventListener("mouseleave", () => { visible = false; kick(); });
    addEventListener("blur", () => { visible = false; kick(); });
    apply();
  }
  if (document.body) start(); else addEventListener("DOMContentLoaded", start);
})();
