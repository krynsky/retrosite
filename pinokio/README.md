# Retrosite Pinokio Launcher

Retrosite turns public Wayback Machine captures into editable website timeline reports. This launcher installs the Retrosite local app, starts the API and Vite UI, and opens the app at `http://127.0.0.1:5173/`.

## Use

1. Open this `pinokio` folder in Pinokio.
2. Click `Install`.
3. Click `Start`.
4. Use Retrosite to create, edit, export, and browse local timeline reports.

Generated reports and screenshots stay local inside `app/server/generated/`.

## Launcher Scripts

- `install.js` clones `https://github.com/krynsky/retrosite`, installs npm dependencies, and installs Playwright Chromium.
- `start.js` runs `npm run dev` with local report generation enabled.
- `update.js` pulls the latest Retrosite code and refreshes dependencies.
- `reset.js` removes dependencies and build caches without deleting generated reports.

## API

The local API runs on `http://127.0.0.1:4317/` while the launcher is running.

Create a report with curl:

```bash
curl -X POST http://127.0.0.1:4317/api/reports \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"example.com\"}"
```

Create a report with JavaScript:

```javascript
await fetch("http://127.0.0.1:4317/api/reports", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "example.com" })
});
```

Create a report with Python:

```python
import requests

requests.post(
    "http://127.0.0.1:4317/api/reports",
    json={"url": "example.com"},
    timeout=30,
)
```
