// Keep Focus — LinkedIn click counter + reminder modal
// Runs in every LinkedIn frame. Sub-frames only count clicks; the top frame shows the modal.
(() => {
  const alive = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  };
  // Skip if a working copy is already running here. If the old copy belongs to a
  // reloaded (dead) extension, run anyway so the page is covered again.
  if (window.__keepFocus && window.__keepFocus.alive()) return;
  window.__keepFocus = { alive };

  const isTop = window === window.top;
  let host = null;      // shadow host element while the modal is open
  let observer = null;  // puts the modal back if the page removes it

  function send(msg) {
    return new Promise((resolve) => {
      if (!alive()) return resolve(null);
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          void chrome.runtime.lastError;
          resolve(res || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  // ---------- click counting ----------

  function onClick(e) {
    if (!alive()) {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('auxclick', onClick, true);
      return;
    }
    if (!e.isTrusted) return;
    if (host) {
      ensureMounted(); // modal is open: make sure it's still on screen
      return;
    }
    send({ type: 'liClick', top: isTop }).then((res) => {
      if (isTop && res && res.showModal) showModal(res.clicks);
    });
  }

  // Window + capture phase + document_start = we see the click before LinkedIn can stop it.
  window.addEventListener('click', onClick, true);
  window.addEventListener('auxclick', onClick, true); // middle-click / open in new tab

  if (isTop) {
    // A click inside an embedded frame can trigger the modal here.
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'kfShowModal') showModal(msg.clicks);
    });

    // Already over the limit? Show the reminder as soon as the page opens.
    send({ type: 'liStatus' }).then((res) => {
      if (res && res.overLimit) {
        const show = () => showModal(res.clicks);
        if (document.documentElement) show();
        else document.addEventListener('DOMContentLoaded', show, { once: true });
      }
    });
  }

  // ---------- modal ----------

  function ensureMounted() {
    if (host && !host.isConnected && document.documentElement) {
      document.documentElement.appendChild(host);
    }
  }

  function showModal(clicks) {
    if (host) { ensureMounted(); return; }

    host = document.createElement('div');
    host.id = 'keep-focus-root';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block;';
    const root = host.attachShadow({ mode: 'closed' });

    root.innerHTML = `
      <style>${CSS}</style>
      <div class="backdrop">
        <div class="card" role="alertdialog" aria-modal="true" aria-labelledby="kf-title" aria-describedby="kf-body">
          <div class="pulse"><span></span></div>
          <p class="eyebrow">Keep Focus</p>
          <h2 id="kf-title">Reminder: You've clicked ${clicks} times.</h2>
          <p id="kf-body">Keep away from social media and get back to your goals!</p>
          <div class="actions">
            <button class="primary" data-action="close">Close Tab</button>
            <button class="ghost" data-action="snooze">I Need 1 More Minute</button>
          </div>
        </div>
      </div>
    `;

    // Attach to <html>, not <body>: LinkedIn re-renders <body> content.
    document.documentElement.appendChild(host);
    observer = new MutationObserver(ensureMounted);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    const closeBtn = root.querySelector('[data-action="close"]');
    const snoozeBtn = root.querySelector('[data-action="snooze"]');
    requestAnimationFrame(() => closeBtn.focus());

    // Keep keyboard focus inside the modal.
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      (root.activeElement === closeBtn ? snoozeBtn : closeBtn).focus();
    });

    closeBtn.addEventListener('click', () => send({ type: 'closeTab' }));

    snoozeBtn.addEventListener('click', async () => {
      await send({ type: 'liSnooze' });
      if (observer) { observer.disconnect(); observer = null; }
      const backdrop = root.querySelector('.backdrop');
      backdrop.classList.add('leaving');
      const finish = () => {
        if (host) host.remove();
        host = null;
        document.documentElement.style.overflow = prevOverflow;
      };
      backdrop.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 400); // in case animations are disabled
    });
  }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .backdrop {
      position: fixed; inset: 0;
      display: grid; place-items: center;
      padding: 16px;
      background: rgba(6, 8, 14, 0.62);
      backdrop-filter: blur(10px) saturate(120%);
      -webkit-backdrop-filter: blur(10px) saturate(120%);
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      animation: fadeIn 0.28s ease-out both;
    }
    .backdrop.leaving { animation: fadeOut 0.22s ease-in both; }
    .backdrop.leaving .card { animation: popOut 0.22s ease-in both; }

    .card {
      width: min(440px, 100%);
      padding: 32px 28px 24px;
      border-radius: 22px;
      text-align: center;
      color: #E9ECF3;
      background:
        radial-gradient(120% 80% at 50% 0%, rgba(110, 139, 255, 0.16), transparent 60%),
        linear-gradient(180deg, #171B25 0%, #10131A 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow:
        0 30px 80px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(110, 139, 255, 0.06) inset;
      animation: popIn 0.42s cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
    }

    .pulse {
      position: relative;
      width: 56px; height: 56px; margin: 0 auto 18px;
      border-radius: 50%;
      background: rgba(110, 139, 255, 0.14);
      display: grid; place-items: center;
    }
    .pulse::before {
      content: ""; position: absolute; inset: 0; border-radius: 50%;
      border: 2px solid rgba(110, 139, 255, 0.45);
      animation: ring 2.2s ease-out infinite;
    }
    .pulse span {
      width: 18px; height: 18px; border-radius: 50%;
      background: #6E8BFF;
      box-shadow: 0 0 24px rgba(110, 139, 255, 0.8);
    }

    .eyebrow {
      margin: 0 0 8px;
      font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
      color: #8D96AD; font-weight: 600;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 21px; line-height: 1.3; font-weight: 650;
      color: #F4F6FB;
    }
    p#kf-body {
      margin: 0 0 24px;
      font-size: 15px; line-height: 1.55; color: #AEB6C9;
    }

    .actions { display: flex; flex-direction: column; gap: 10px; }
    button {
      all: unset; box-sizing: border-box;
      width: 100%; padding: 13px 16px;
      border-radius: 12px; cursor: pointer;
      font: 600 14.5px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      text-align: center;
      transition: transform 0.15s ease, background 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
    }
    button:active { transform: scale(0.98); }
    button:focus-visible { outline: 2px solid #9FB3FF; outline-offset: 2px; }
    .primary {
      background: linear-gradient(180deg, #7C97FF, #5D7BF5);
      color: #fff;
      box-shadow: 0 8px 24px rgba(93, 123, 245, 0.35);
    }
    .primary:hover { box-shadow: 0 10px 30px rgba(93, 123, 245, 0.5); transform: translateY(-1px); }
    .ghost {
      background: rgba(255, 255, 255, 0.04);
      color: #AEB6C9;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .ghost:hover { background: rgba(255, 255, 255, 0.08); color: #E9ECF3; }

    @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
    @keyframes popIn   { from { opacity: 0; transform: translateY(14px) scale(0.94); } to { opacity: 1; transform: none; } }
    @keyframes popOut  { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(8px) scale(0.97); } }
    @keyframes ring    { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(1.7); opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      .backdrop, .card, .pulse::before { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
    }
  `;
})();
