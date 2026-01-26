# CamDash

CamDash is a lightweight, browser-based CCTV dashboard for kiosk and monitoring displays. It shows up to four HLS camera streams per page, supports automatic page cycling, manual navigation, and tuned live-playback settings for smooth, low-latency viewing.

## Features
- Auto-cycle pages with configurable intervals (30 / 60 / 90s)
- HLS playback with Hls.js (or native HLS on Safari)
- Keyboard shortcuts for navigation and timer control
- Minimal UI optimized for full-screen kiosk use

## UI behavior
- The top control bar is hidden by default to maximize video area. Move the mouse to the very top edge of the screen to reveal it. You can adjust the hotspot height in `dashboard/styles.css` under `.topbar-hotspot`.

## Project structure
- `dashboard/index.html` - dashboard HTML
- `dashboard/styles.css` - main stylesheet
- `dashboard/app.js` - client-side app logic (HLS players, paging, timers)
- `dashboard/config.js` - site-specific camera pages and settings (provided by you)
- `go2rtc.yml` - go2rtc configuration (optional)
- `go2rtc-example.yml` - example go2rtc configuration template
- `docker-compose.yml`, `nginx.conf` - optional deployment helpers

## Getting started
1. Edit `dashboard/config.js` and define `window.CAMDASH_CONFIG` with your `pages` and `cams`. Each page may contain up to 4 camera entries.
2. Serve the `dashboard` folder from a static web server on your kiosk device. Example (from inside `dashboard`):

```bash
cd dashboard
python -m http.server 8000
# then open http://localhost:8000/ in your kiosk browser
```

3. If you proxy camera streams through `go2rtc` or another HLS provider, set `go2rtcBase` in `config.js` to the proxy base URL (or leave empty to use same origin `/api` path).

## Docker (go2rtc + nginx)
The included `docker-compose.yml` runs `go2rtc` and an `nginx` web service. `nginx` serves the UI and proxies `/api/` to `go2rtc` to avoid cross-origin issues.

```bash
docker compose up -d
```

## Configuration reference
- `CAMDASH_CONFIG.pages` - array of pages. Each page: `{ name: 'Floor 1', cams: [{ id: 'stream-id', label: 'Cam 1' }, ...] }`.
- `CAMDASH_CONFIG.defaultSeconds` - default cycle interval (30/60/90).
- `CAMDASH_CONFIG.go2rtcBase` - base URL for HLS proxy (optional).

## Troubleshooting
- If a stream shows `HLS unsupported`, make sure Hls.js is loaded (the app includes a CDN import) or the browser supports native HLS.
- If playback stalls, check network connectivity to the HLS source and adjust `maxBufferLength` in `dashboard/app.js` if needed.

## License
MIT. See `LICENSE`.
