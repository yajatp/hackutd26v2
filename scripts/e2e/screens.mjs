// What scripts/e2e.mjs reads off the two screens. readConsole, readPhone, armWatch and tapHook run
// inside the browser page (Playwright sends their source), so each one is self-contained.
// Texts are read as the visible words joined by single spaces, e.g. "✓ CONFIRMED by the night shift at 01:30 AM".

// /console (app/console/page.tsx, Board.tsx): header badge, the first fix card, "Sensors to check",
// any open "Carry this to the Darkroom box" panel, and when the latency watcher saw the change.
export function readConsole() {
  const words = (el) => {
    if (!el) return "";
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const t = w.currentNode.textContent.replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    }
    return out.join(" ");
  };
  const header = document.querySelector("main > header");
  const badge = words(header?.querySelector("[role=status]"));
  const live = /LIVE/.test(badge) ? "LIVE" : /DISCONNECTED/.test(badge) ? "DISCONNECTED" : /Connecting/.test(badge) ? "Connecting" : badge || "no status badge";
  const src = [...(header?.querySelectorAll("span") ?? [])].map(words).find((t) => / · now \d{4}-/.test(t)) ?? "";
  const cards = [...document.querySelectorAll("main section")].filter((s) => /pump failed/i.test(s.querySelector(":scope > header")?.textContent ?? ""));
  let top = null;
  if (cards[0]) {
    const c = cards[0];
    const h = c.querySelector(":scope > header");
    const ps = [...c.querySelectorAll("p")];
    const doP = ps.find((p) => words(p).startsWith("Do this:"));
    const checkP = ps.find((p) => words(p).startsWith("CHECK THE TANK SENSOR FIRST"));
    const text = words(c);
    top = {
      facility: words(h.children[0]).replace(/ · pump failed$/i, ""),
      countdown: words(h.children[1]).replace(/^▲\s*/, ""),
      doThis: words(doP),
      cost: words(doP?.nextElementSibling),
      check: checkP ? words(checkP) : null,
      confirmBtn: [...c.querySelectorAll("button")].some((b) => words(b) === "Confirm this plan"),
      confirmed: /\bCONFIRMED\b/.test(text),
      changed: text.includes("CONFIRMED, THEN CHANGED"),
      plain: /✓ CONFIRMED by the night shift at/.test(text),
      at: (text.match(/by the night shift at (\d{1,2}:\d{2}(?: ?[AP]M)?)/) ?? [])[1] ?? null,
    };
  }
  const sh = [...document.querySelectorAll("main h2")].find((x) => /^sensors to check$/i.test(x.textContent.trim()));
  const sensors = sh ? [...sh.parentElement.querySelectorAll("li")].map((li) => ({ head: words(li.children[0]), evidence: words(li.children[1]) })) : null;
  const evidence = [...document.querySelectorAll("main p")]
    .filter((p) => p.textContent.trim() === "Carry this to the Darkroom box")
    .map((p) => {
      const t = words(p.parentElement);
      return {
        ref: (t.match(/\bAV-[0-9A-F]{4}-[0-9A-F]{4}\b/) ?? [])[0] ?? null,
        hash: (t.match(/Fingerprint \(SHA-256\): ([0-9a-f]{64})\b/) ?? [])[1] ?? null,
      };
    });
  const overlay = document.querySelector("main [data-lockdown]");
  const lockdown = overlay?.getAttribute("data-lockdown") ?? null;
  const card = overlay?.querySelector('section[aria-label="Evidence to carry"]');
  const lockdownRef = (words(card).match(/\bAV-[0-9A-F]{4}-[0-9A-F]{4}\b/) ?? [])[0] ?? null;
  return { live, dataset: src.split(" · now ")[0] || null, top, sensors, evidence, lockdown, lockdownRef, changedAt: window.__e2eChangedAt ?? null };
}

// /attack (app/attack/page.tsx): header badge, the tank list, the active faults and any error.
export function readPhone() {
  const words = (el) => {
    if (!el) return "";
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const t = w.currentNode.textContent.replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    }
    return out.join(" ");
  };
  const badge = words(document.querySelector("main > header [role=status]"));
  const live = /LIVE/.test(badge) ? "LIVE" : /DISCONNECTED/.test(badge) ? "DISCONNECTED" : /Connecting/.test(badge) ? "Connecting" : badge || "no status badge";
  const radios = [...document.querySelectorAll("[role=radio]")].map((r) => ({ text: words(r), on: r.getAttribute("aria-checked") === "true" }));
  const ah = [...document.querySelectorAll("main h2")].find((x) => /Active faults \(\d+\)/.test(x.textContent));
  const active = ah ? Number(ah.textContent.match(/\((\d+)\)/)[1]) : null;
  const faults = ah ? [...ah.parentElement.querySelectorAll("li")].map(words) : [];
  const alerts = [...document.querySelectorAll("main [role=alert]")].map(words);
  const alert = alerts.join(" / ") || null;
  const lockdownBanner = alerts.find((text) => text.includes("The site is in LOCKDOWN.")) ?? null;
  const faultButtons = {};
  for (const button of document.querySelectorAll('section[aria-labelledby="break"] button')) {
    const verb = words(button).match(/^(Kill|Fake|Drift)\b/)?.[1];
    // Phone 1 folds the whole panel into an inert subtree during lockdown.
    if (verb) faultButtons[verb] = button.disabled || !!button.closest("[inert]");
  }
  return { live, radios, active, faults, alert, lockdownBanner, faultButtons };
}

// Console: note the first moment the top card says CHECK THE TANK SENSOR FIRST (the change the
// Fake tap causes). Returns false when it already says so, so the latency would mean nothing.
export function armWatch() {
  window.__e2eChangedAt = null;
  window.__e2eWatch?.disconnect();
  const seen = () => document.body.textContent.includes("CHECK THE TANK SENSOR FIRST");
  if (seen()) return false;
  const mo = new MutationObserver(() => {
    if (window.__e2eChangedAt === null && seen()) {
      window.__e2eChangedAt = Date.now();
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.__e2eWatch = mo;
  return true;
}

// Phone (init script): the time of every button click, so the latency starts at the tap itself.
export function tapHook() {
  window.__e2eTaps = [];
  window.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest("button") : null;
    if (b) window.__e2eTaps.push({ at: Date.now(), text: b.textContent.trim() });
  }, true);
}

const html = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// One PNG per step: the console (left) and the phone (right) as they look right now.
export async function saveShot(comp, con, att, file, caption) {
  const [a, b] = await Promise.all([con.screenshot(), att.screenshot()]);
  const img = (buf, w) => `<img width="${w}" src="data:image/png;base64,${buf.toString("base64")}">`;
  await comp.setContent(
    `<!doctype html><body style="margin:0;padding:12px;background:#111;color:#eee;font:15px system-ui,sans-serif">`
    + `<div style="margin-bottom:8px">${html(caption)}</div>`
    + `<div style="display:flex;gap:16px;align-items:flex-start">${img(a, 1366)}${img(b, 360)}</div></body>`,
    { waitUntil: "load" },
  );
  await comp.screenshot({ path: file, fullPage: true });
}
