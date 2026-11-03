# Keep Focus

A tiny Chrome extension that keeps you off social media.

- **Instant block:** Instagram, X and Twitter redirect to a calm screen that says "Focus on what matters. Get back to work."
- **LinkedIn nudge:** after 3 clicks on LinkedIn, a reminder pops up with two buttons. **Close Tab** closes the tab. **I Need 1 More Minute** hides the reminder until you've clicked 3 more times.
- **Toolbar popup:** shows today's blocked visits (also shown as a badge on the icon) and your LinkedIn clicks.

Built with plain HTML, CSS and JavaScript on Manifest V3. There's no build step and nothing is tracked or sent anywhere.

## Install (developer mode)

1. Download or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `keep-focus` folder.
5. Pin the extension from the puzzle-piece menu so you can see the badge.

To block in incognito too: open the extension's **Details** and turn on **Allow in Incognito**.

## How it works

| File | Role |
|---|---|
| `manifest.json` | Extension config and permissions |
| `rules.json` | `declarativeNetRequest` rules. Redirects blocked domains before they load, and blocks their data requests |
| `guard.js` | Runs first on blocked sites and redirects, catching pages served from the site's own cache |
| `background.js` | Service worker. Keeps the counts and badge, closes tabs, catches in-page navigation, and sweeps tabs that were already open at install |
| `blocked.html/.css/.js` | The calm screen. Reports each visit to the counter |
| `linkedin.js` | Content script. Counts clicks and shows the reminder in a Shadow DOM so LinkedIn's styles can't affect it |
| `popup.html/.css/.js` | Toolbar popup with today's stats |

- **Daily counts** are kept in `chrome.storage.local` and reset at midnight.
- **LinkedIn session clicks** are kept in `chrome.storage.session`. They're shared across tabs and reset when the browser restarts.

## Customize

- **Block more sites:** add domains to `requestDomains` in `rules.json` and to `host_permissions` in `manifest.json`.
- **Change the click limit:** edit `CLICK_LIMIT` in `background.js`.

After any change, click the reload icon on the extension card in `chrome://extensions`.

## License

MIT
