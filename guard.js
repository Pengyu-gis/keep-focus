// Keep Focus — last line of defence on blocked sites.
// Runs before the page renders, even when the site serves itself from its own
// service worker cache (which can slip past the network-level rule).
(() => {
  try {
    document.documentElement.style.setProperty('visibility', 'hidden', 'important');
  } catch {}
  location.replace(chrome.runtime.getURL('blocked.html'));
})();
