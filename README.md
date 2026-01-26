# CamDash

CamDash is a lightweight, browser-based CCTV dashboard for kiosk and monitoring displays. It shows up to four HLS camera streams per page, supports automatic page cycling, manual navigation, and tuned live-playback settings for smooth, low-latency viewing.

## Highlights
- 4-up camera dashboard with paging
- Auto-cycle with 30/60/90s intervals
- Hls.js playback (or native HLS on Safari)
- Clean, kiosk-first UI with hidden topbar

## Quick start
1. Edit `dashboard/config.js` and define your pages and camera ids.
2. Serve the `dashboard` folder from a static web server:

```bash
cd dashboard
python -m http.server 8000
# open http://localhost:8000/ in your kiosk browser
```

3. If you proxy camera streams through `go2rtc`, set `go2rtcBase` in `config.js` to the proxy base URL (or leave empty to use same-origin `/api`).

## Configuration reference
Top-level options in `dashboard/config.js`:

- `go2rtcBase` - base URL for HLS proxy (optional)
- `defaultSeconds` - default page cycle interval (30/60/90)
- `autoCycle` - enable/disable automatic paging
- `dataSource` - where cameras/slides come from
  - `mode` - `remote` (DB) or `local` (use `pages` below)
  - `apiBase` - API base path (default `/camdash-api`)
  - `refreshSeconds` - remote refresh interval
- `ui` - UI settings
  - `topbarAutoHide` - hide topbar until hover
  - `topbarHotspotPx` - hover hotspot height in pixels
  - `showClock` / `showTimer` / `showPage` - visibility toggles
  - `showBrand` / `showNav` - show or hide brand and prev/next controls
  - `showBadges` / `showLiveBadge` - toggle camera badges and LIVE chip
  - `showEmptyLabels` - show labels in empty tiles
  - `showBackgroundGrid` - show the background grid texture
  - `compact` - denser topbar layout
  - `layout` - `fixed` (always 2x2) or `auto` (adapt to camera count)
  - `includeLocationInLabel` - append location to camera labels
  - `adminEnabled` / `showAdminButton` - enable admin UI and show button
  - `titlePrefix` - document title prefix
  - `labels` - override UI text labels (prev/next/timer/etc.)
  - `theme` - override CSS variables (accent, bg, border, etc.)
- `hls` - Hls.js tuning overrides (optional)
- `pages` - array of pages with camera entries: `{ name, cams: [{ id, label }, ...] }`

Example UI overrides:

```js
ui: {
  compact: true,
  showBadges: false,
  showBackgroundGrid: false,
  layout: "auto",
  titlePrefix: "CamDash Lobby",
  labels: { prev: "Zuruck", next: "Weiter", live: "LIVE" },
  theme: { accent: "#ffb84a", bg: "#0a0d12" },
}
```

## Remote config + Admin UI
If `dataSource.mode` is `remote`, CamDash loads cameras and slides from the API container. The admin UI lets you add and edit cameras, create profiles (slideshows), and assign cameras to slides.

Admin UI access:
- Press `Ctrl + Shift + A` in the browser, or
- Open with `?admin=1` in the URL, or
- Set `ui.showAdminButton = true` to show a topbar button.

## API container
The API is started automatically by `docker compose up -d`. Data is stored in `./data/camdash.db` on the host.
Maximum cameras per slide is 6 (change with `CAMDASH_MAX_CAMS` on the API container).

## URL parameters
- `t` - timer in seconds (`30`, `60`, `90`)
- `p` - page index (1-based)

## Docker (go2rtc + nginx)
The included `docker-compose.yml` runs `go2rtc` and an `nginx` web service. `nginx` serves the UI and proxies `/api/` to `go2rtc` to avoid cross-origin issues.

```bash
docker compose up -d --build
```

## Troubleshooting
- If a stream shows `HLS unsupported`, make sure Hls.js is loaded (the app includes a CDN import) or the browser supports native HLS.
- If playback stalls, check network connectivity to the HLS source and adjust `hls` options in `dashboard/config.js`.

## License
MIT. See `LICENSE`.
