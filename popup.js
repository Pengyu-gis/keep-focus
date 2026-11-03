chrome.runtime.sendMessage({ type: 'getStats' }, (s) => {
  void chrome.runtime.lastError;
  if (!s || s.error) return;
  document.getElementById('blocked').textContent = s.blocked;
  document.getElementById('liToday').textContent = s.linkedinClicks;
  const left = Math.max(0, s.nextAt - s.sessionClicks);
  document.getElementById('liNext').textContent =
    left === 0 ? 'on next click' : `in ${left} click${left === 1 ? '' : 's'}`;
});
