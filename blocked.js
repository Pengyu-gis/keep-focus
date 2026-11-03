// Count this visit, then show today's total.
chrome.runtime.sendMessage({ type: 'blockedVisit' }, (res) => {
  void chrome.runtime.lastError;
  if (res && typeof res.blocked === 'number') {
    document.getElementById('count').textContent = res.blocked;
    document.getElementById('unit').textContent =
      res.blocked === 1 ? 'blocked visit today' : 'blocked visits today';
  }
});

document.getElementById('close').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'closeTab' });
});
