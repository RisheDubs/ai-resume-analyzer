/* Top-right preferences: cursor style menu + light/dark switch.
   Include after meteor-cursor.js. Add data-theme-toggle="off" on the script tag to hide the theme switch. */
(function () {
  const me = document.currentScript;
  const THEME_ON = !me || me.dataset.themeToggle !== "off";
  const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const MC = window.MeteorCursor;
  const showCursor = MC && MC.supported;

  const OPTIONS = [
    { v: "off", label: "Default cursor" },
    { v: "orange", label: "Meteor \u00b7 orange" },
    { v: "blue", label: "Meteor \u00b7 blue" },
    { v: "pink", label: "Meteor \u00b7 pink" },
  ];
  const ICON_CURSOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.5 18.5 10l-5.6 1.9-2.4 5.6z"/><path d="m13 12 5 5" stroke-linecap="round"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  const css = document.createElement("style");
  css.textContent = `
    .prefs { position: fixed; z-index: 101; top: calc(2vmin + env(safe-area-inset-top, 0px)); right: max(4vmin, 16px, env(safe-area-inset-right, 0px));
      display: flex; gap: 1px; padding: 1px; border-radius: 9px; background: var(--nav-surface, #e3e3e3); box-shadow: 0 6px 24px rgba(0,0,0,0.12);
      font-family: var(--font, system-ui, sans-serif); opacity: 0; transform: translateY(-10px); transition: opacity 700ms ease, transform 700ms ease; }
    .prefs.revealed { opacity: 1; transform: none; }
    .pref-btn { width: 40px; height: 40px; border: 0; border-radius: 8px; display: grid; place-items: center; padding: 0;
      background: var(--nav-item, #fff); color: var(--nav-ink, #1a1a1a); cursor: pointer; transition: background 250ms ease, color 250ms ease; }
    .pref-btn:hover, .pref-btn[aria-expanded="true"] { background: var(--nav-cta, #0d0d0d); color: var(--nav-cta-ink, #f4f4f4); }
    .pref-btn svg { width: 18px; height: 18px; }
    .pref-cursor { position: relative; }
    .pref-menu { position: absolute; right: 0; top: calc(100% + 8px); min-width: 210px; padding: 5px; border-radius: 12px;
      background: var(--nav-item, #fff); color: var(--nav-ink, #1a1a1a); box-shadow: 0 18px 50px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.06);
      display: grid; gap: 2px; transform-origin: top right; animation: prefPop 180ms cubic-bezier(.2,.8,.2,1); }
    .pref-menu[hidden] { display: none !important; }
    @keyframes prefPop { from { opacity: 0; transform: scale(0.96) translateY(-4px); } }
    .pref-menu .ttl { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.55; padding: 8px 10px 4px; }
    .pref-opt { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: 8px; background: transparent;
      color: inherit; font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
    .pref-opt:hover, .pref-opt:focus-visible { background: rgba(127,127,127,0.14); outline: none; }
    .pref-opt .sw { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12); display: grid; place-items: center; }
    .pref-opt .sw svg { width: 12px; height: 12px; }
    .sw-off { background: transparent; box-shadow: none !important; }
    .sw-orange { background: radial-gradient(circle at 35% 35%, #fff3d6 0 18%, #ffad5c 40%, #ff6a3a 75%); }
    .sw-blue { background: radial-gradient(circle at 35% 35%, #f1faff 0 18%, #86c8ff 40%, #3d7bff 75%); }
    .sw-pink { background: radial-gradient(circle at 35% 35%, #fff0fa 0 18%, #ff92d2 40%, #ff4fa8 75%); }
    .pref-opt .ck { margin-left: auto; width: 16px; height: 16px; opacity: 0; }
    .pref-opt[aria-checked="true"] .ck { opacity: 1; }
    @media (prefers-reduced-motion: reduce) { .prefs, .pref-menu { transition: none; animation: none; } }`;
  document.head.appendChild(css);

  const box = document.createElement("div");
  box.className = "prefs"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "Display preferences");
  let html = "";
  if (showCursor) {
    html += `<div class="pref-cursor"><button class="pref-btn" id="pref-cursor-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="pref-cursor-menu" aria-label="Cursor style" title="Cursor style">${ICON_CURSOR}</button>
      <div class="pref-menu" id="pref-cursor-menu" role="menu" aria-label="Cursor style" hidden><div class="ttl">Cursor</div>
      ${OPTIONS.map((o) => `<button class="pref-opt" role="menuitemradio" aria-checked="false" data-v="${o.v}"><span class="sw sw-${o.v}">${o.v === "off" ? ICON_CURSOR : ""}</span>${o.label}<span class="ck">${ICON_CHECK}</span></button>`).join("")}
      </div></div>`;
  }
  if (THEME_ON) html += `<button class="pref-btn" id="pref-theme-btn" aria-label="Switch to dark mode" title="Switch to dark mode"></button>`;
  if (!html) return;
  box.innerHTML = html;

  function mount() {
    document.body.appendChild(box);
    // Appear together with the site header when there is one
    const hdr = document.getElementById("site-header");
    if (hdr) {
      const sync = () => box.classList.toggle("revealed", hdr.classList.contains("revealed"));
      new MutationObserver(sync).observe(hdr, { attributes: true, attributeFilter: ["class"] }); sync();
    } else requestAnimationFrame(() => box.classList.add("revealed"));

    if (showCursor) {
      const btn = box.querySelector("#pref-cursor-btn"), menu = box.querySelector("#pref-cursor-menu");
      const opts = [...menu.querySelectorAll(".pref-opt")];
      const mark = () => opts.forEach((o) => o.setAttribute("aria-checked", String(o.dataset.v === MC.get())));
      const open = (v) => { menu.hidden = !v; btn.setAttribute("aria-expanded", String(v)); if (v) (opts.find((o) => o.getAttribute("aria-checked") === "true") || opts[0]).focus(); };
      mark();
      btn.addEventListener("click", () => open(menu.hidden));
      opts.forEach((o) => o.addEventListener("click", () => { MC.set(o.dataset.v); mark(); open(false); btn.focus(); }));
      menu.addEventListener("keydown", (e) => {
        const i = opts.indexOf(document.activeElement);
        if (e.key === "ArrowDown") { e.preventDefault(); opts[(i + 1) % opts.length].focus(); }
        if (e.key === "ArrowUp") { e.preventDefault(); opts[(i - 1 + opts.length) % opts.length].focus(); }
        if (e.key === "Escape") { open(false); btn.focus(); }
      });
      document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !box.contains(e.target)) open(false); });
    }
    if (THEME_ON) {
      const tb = box.querySelector("#pref-theme-btn");
      const paint = () => {
        const dark = document.documentElement.dataset.theme === "dark";
        tb.innerHTML = dark ? ICON_SUN : ICON_MOON;
        const l = dark ? "Switch to light mode" : "Switch to dark mode";
        tb.setAttribute("aria-label", l); tb.title = l;
      };
      paint();
      tb.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next; write("siteTheme", next); paint();
        document.dispatchEvent(new CustomEvent("themechange", { detail: next }));
      });
    }
  }
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);
})();
