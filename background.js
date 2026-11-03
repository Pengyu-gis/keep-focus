// Keep Focus — background service worker
// Owns all counters so updates from many tabs never race each other.

const CLICK_LIMIT = 3; // LinkedIn clicks before the reminder appears

// ---------- helpers ----------

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Run storage updates one at a time (rapid clicks can arrive together).
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// Daily stats live in local storage and reset when the date changes.
async function getDaily() {
  const { daily } = await chrome.storage.local.get('daily');
  const today = todayKey();
  if (!daily || daily.date !== today) {
    const fresh = { date: today, blocked: 0, linkedinClicks: 0 };
    await chrome.storage.local.set({ daily: fresh });
    return fresh;
  }
  return daily;
}

// LinkedIn session state lives in session storage (clears when the browser restarts).
async function getLinkedInSession() {
  const { li } = await chrome.storage.session.get('li');
  return li || { clicks: 0, nextAt: CLICK_LIMIT };
}

async function updateBadge() {
  const daily = await getDaily();
  await chrome.action.setBadgeBackgroundColor({ color: '#6E8BFF' });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  }
  await chrome.action.setBadgeText({ text: daily.blocked ? String(daily.blocked) : '' });
}

// ---------- LinkedIn counting ----------

// Clicks AND page visits (open, reload, in-site navigation) count, so typing URLs
// or reloading can't get around the limit. A click that leads to a new page, and
// the page load + URL change of one navigation, are merged into a single count.
const MERGE_MS = 3000;
const lastCount = new Map(); // tabId -> time of last counted LinkedIn action

async function countLinkedIn(tabId, kind) {
  const li = await getLinkedInSession();
  const now = Date.now();
  const recent = tabId != null && now - (lastCount.get(tabId) || 0) < MERGE_MS;

  if (kind === 'click' || !recent) {
    li.clicks += 1;
    await chrome.storage.session.set({ li });
    const daily = await getDaily();
    daily.linkedinClicks += 1;
    await chrome.storage.local.set({ daily });
  }
  if (tabId != null) lastCount.set(tabId, now);
  return { clicks: li.clicks, showModal: li.clicks >= li.nextAt };
}

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;

// ---------- message handlers ----------

const handlers = {
  // blocked.html reports each time it is shown
  async blockedVisit() {
    const daily = await getDaily();
    daily.blocked += 1;
    await chrome.storage.local.set({ daily });
    await updateBadge();
    return { blocked: daily.blocked };
  },

  // linkedin.js reports every real click on the page
  async liClick(msg, sender) {
    const { clicks, showModal } = await countLinkedIn(sender.tab && sender.tab.id, 'click');
    const li = { clicks };
    // Click came from an embedded frame: ask the tab's top frame to show the modal.
    // The frame says itself whether it's on top. Chrome's frameId can't be trusted for
    // this: a page Chrome pre-loaded (e.g. a URL typed in the address bar) keeps a
    // non-zero frameId even after it becomes the visible page.
    if (showModal && !msg.top && sender.tab) {
      chrome.tabs
        .sendMessage(sender.tab.id, { type: 'kfShowModal', clicks: li.clicks })
        .catch(() => {});
      return { clicks: li.clicks, showModal: false };
    }
    return { clicks: li.clicks, showModal };
  },

  // A LinkedIn page was opened or reloaded (top frame only).
  async liView(_msg, sender) {
    return countLinkedIn(sender.tab && sender.tab.id, 'view');
  },

  // "I Need 1 More Minute" -> quiet until 3 more clicks
  async liSnooze() {
    const li = await getLinkedInSession();
    li.nextAt = li.clicks + CLICK_LIMIT;
    await chrome.storage.session.set({ li });
    return { nextAt: li.nextAt };
  },

  // Pages can't close their own tab, so they ask us to.
  async closeTab(_msg, sender) {
    if (sender.tab && sender.tab.id != null) {
      await chrome.tabs.remove(sender.tab.id);
    }
    return { ok: true };
  },

  async getStats() {
    const daily = await getDaily();
    const li = await getLinkedInSession();
    return {
      blocked: daily.blocked,
      linkedinClicks: daily.linkedinClicks,
      sessionClicks: li.clicks,
      nextAt: li.nextAt,
    };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg && msg.type];
  if (!handler) return false;
  serial(() => handler(msg, sender))
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err) }));
  return true; // keep the channel open for the async reply
});

// ---------- catch what the network rule misses ----------

const BLOCKED_HOST = /(^|\.)(instagram\.com|x\.com|twitter\.com)$/i;
const BLOCKED_PATTERNS = ['*://*.instagram.com/*', '*://*.x.com/*', '*://*.twitter.com/*'];
const LINKEDIN_PATTERNS = ['*://*.linkedin.com/*'];
const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');

function isBlockedUrl(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && BLOCKED_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

// In-page navigation (X and Instagram are single-page apps) and pages served
// from the site's own service worker never hit the network rule. Watch tab URLs too.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  if (isBlockedUrl(changeInfo.url)) {
    chrome.tabs.update(tabId, { url: BLOCKED_PAGE }).catch(() => {});
    return;
  }
  // Moving to another LinkedIn page (including in-site navigation) counts too.
  let host = '';
  try { host = new URL(changeInfo.url).hostname; } catch {}
  if (LINKEDIN_HOST.test(host)) {
    serial(() => countLinkedIn(tabId, 'nav')).then((res) => {
      if (res && res.showModal) {
        chrome.tabs.sendMessage(tabId, { type: 'kfShowModal', clicks: res.clicks }).catch(() => {});
      }
    });
  }
});

// Tabs that were already open before install/startup are never re-checked by Chrome.
async function sweepOpenTabs() {
  const blocked = await chrome.tabs.query({ url: BLOCKED_PATTERNS });
  for (const tab of blocked) {
    chrome.tabs.update(tab.id, { url: BLOCKED_PAGE }).catch(() => {});
  }
  const linkedin = await chrome.tabs.query({ url: LINKEDIN_PATTERNS });
  for (const tab of linkedin) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['linkedin.js'] })
      .catch(() => {});
  }
}

// ---------- lifecycle ----------

function init() {
  chrome.alarms.create('daily-check', { periodInMinutes: 10 });
  serial(updateBadge);
  sweepOpenTabs();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);

// Keeps the badge honest after midnight.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily-check') serial(updateBadge);
});
