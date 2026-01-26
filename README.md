# CamDash

CamDash is a lightweight, browser-based CCTV dashboard designed for kiosk and monitoring displays. It arranges up to four HLS camera streams per page, supports automatic page cycling, manual navigation, and tuned live-playback settings for smooth, low-latency viewing.

**Key features**
- Auto-cycle pages with configurable intervals (30 / 60 / 90s)
- HLS playback with Hls.js (or native HLS on Safari)
- Keyboard shortcuts for navigation and timer control
- Minimal, modern UI optimized for full-screen kiosk use

**Important UI behavior**
- The top control bar is hidden by default to maximize visible video area in kiosk deployments. Move the mouse to the very top edge of the screen to reveal it (or hover the top area).

**Project structure**
- `dashboard/index.html` — dashboard HTML
- `dashboard/styles.css` — main stylesheet (note: `styles.css`)
- `dashboard/app.js` — client-side app logic (HLS players, paging, timers)
- `dashboard/config.js` — site-specific camera pages and settings (provided by you)
- `go2rtc.yml` — example configuration for go2rtc (if you use go2rtc to proxy streams)
- `docker-compose.yml`, `nginx.conf` — optional deployment helpers

Getting started
1. Edit `dashboard/config.js` and define `window.CAMDASH_CONFIG` with your `pages` and `cams`. Each page may contain up to 4 camera entries.
2. Serve the `dashboard` folder from a static web server on your kiosk device. Example (from inside `dashboard`):

```bash
python -m http.server 8000
# then open http://localhost:8000/ in your kiosk browser
```

3. If you proxy camera streams through `go2rtc` or another HLS provider, set `go2rtcBase` in `config.js` to the proxy base URL (or leave empty to use same origin `/api` path).

Kiosk optimization tips
- Use a modern Chromium-based browser in kiosk/fullscreen mode.
- Start the dashboard in fullscreen and hide mouse cursor after a short timeout for clean display.
- The topbar is intentionally hidden — reveal it by moving the cursor to the very top edge. You can adjust the hotspot height in `dashboard/styles.css` under `.topbar-hotspot` if you need easier access.

Configuration quick reference
- `CAMDASH_CONFIG.pages` — Array of pages. Each page: `{ name: 'Floor 1', cams: [{ id: 'rtsp://... or url', label: 'Cam 1' }, ...] }`.
- `CAMDASH_CONFIG.defaultSeconds` — default cycle interval (30/60/90).
- `CAMDASH_CONFIG.go2rtcBase` — base URL for HLS proxy (optional).

Troubleshooting
- If a stream shows `HLS unsupported`, make sure Hls.js is loaded (the app includes a CDN import) or the browser supports native HLS.
- If playback stalls, check network connectivity to the HLS source and adjust `maxBufferLength` in `dashboard/app.js` if needed.

Suggested improvements
- Add persistent kiosk settings (auto-hide delay, hotspot size) in `config.js`.
- Add a small, optional on-screen control to toggle topbar auto-hide in case touch-only devices need it.
- Implement a responsive tile layout for non-4-up pages (1/2/6/etc.) to better use space for other screen ratios.
- Add an optional OSC / WebSocket remote control API for remote page switching without focusing the browser.
- Add a tiny health endpoint that exposes stream statuses for external monitoring / Prometheus scraping.

License
This repository does not include a license file by default. Add a `LICENSE` file if you intend to publish with an explicit license.

If you'd like, I can also open a small PR that adds an example `config.js` and a one-line systemd service / startup snippet for kiosk devices. Want me to add that next?

---

## What I found and fixed

- Broken stylesheet link: `index.html` referenced `style.css` while the repository uses `styles.css`. I updated `index.html` to load `styles.css`.
- Topbar layout: the original layout reserved vertical space for a sticky topbar (`calc(100vh - 60px)`), which reduced usable video area. For kiosk usage I changed the bar to `position: fixed` and added a small invisible `.topbar-hotspot` that reveals the bar on hover. This lets the video grid use the full viewport.
- `wrap` height: switched from `calc(100vh - 60px)` to `100vh` so tiles maximize screen space.

These changes are focused on kiosk display—if you prefer not to have the topbar overlay the tiles when shown, we can add configurable top padding instead.

## Docker / nginx notes

The included `docker-compose.yml` runs `go2rtc` and an `nginx` web service. Keeping `nginx` in the Docker stack is intentional and recommended for container deployments because:

- Same-origin proxy: `nginx` proxies `/api/` to the host `go2rtc` instance. This lets the dashboard call HLS endpoints via `/api/stream.m3u8?...` without cross-origin issues.
- CORS & headers: `nginx` can add CORS/headers or preflight responses if needed, avoiding changes to `go2rtc` or the browser.
- Static serving: `nginx` is tiny, efficient and serves `dashboard` as a static site with correct `index.html` fallback for SPA-style routes.

If you keep the Docker setup as-is, no further changes are required — `nginx` will serve the UI and proxy `/api/` to `go2rtc` (see `nginx.conf`).

If you decide to run the UI on the kiosk host instead of in Docker, set `CAMDASH_CONFIG.go2rtcBase` in `dashboard/config.js` to the reachable go2rtc base URL (for example `http://192.168.1.2:1984`) and make sure the go2rtc instance accepts cross-origin requests or is reachable same-origin.

---

## Host-run quick start (one-liners + systemd)

If you prefer to run the UI directly on the kiosk host (no `nginx` container), here are minimal one-liners and a `systemd` unit you can use. Adjust paths and the `User` as needed.

Serve locally (quick test):

```bash
cd /path/to/CamDash/dashboard
python3 -m http.server 8000
# open http://localhost:8000/ in the kiosk browser
```

Create a simple `systemd` service to start the static server at boot (`/etc/systemd/system/camdash-ui.service`):

```ini
[Unit]
Description=CamDash UI static server
After=network.target

[Service]
User=kiosk
WorkingDirectory=/home/kiosk/CamDash/dashboard
ExecStart=/usr/bin/python3 -m http.server 8000
Restart=on-failure
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now camdash-ui.service
```

Notes:
- Running the UI on the host is the simplest approach for single-device kiosks. It avoids an extra container but requires you to configure `go2rtc` reachability (set `go2rtcBase` in `dashboard/config.js`) and potentially CORS on the go2rtc side.
- If you need the same-origin proxy behavior that `nginx` provides, keep the `nginx` service in `docker-compose.yml` instead.

---

## Debian kiosk setup (example placeholder)

Below is a minimal, pragmatic example to run CamDash in a Chromium kiosk on Debian. Adapt usernames, paths and the served URL to your environment.

1) Install required packages:

```bash
sudo apt update
sudo apt install --no-install-recommends xorg xserver-xorg xinit openbox chromium
```

2) Create a dedicated kiosk user (optional):

```bash
sudo useradd -m -s /bin/bash kiosk
sudo passwd kiosk
```

3) Add an X session starter for the kiosk user at `/home/kiosk/.xsession`:

```sh
# /home/kiosk/.xsession
openbox &
sleep 1
chromium --kiosk --noerrdialogs --disable-infobars --incognito --app=http://localhost:8000
```

4) Create a `systemd` unit to start the X session on boot (`/etc/systemd/system/kiosk.service`):

```ini
[Unit]
Description=Kiosk mode for CamDash
After=network.target

[Service]
User=kiosk
Environment=DISPLAY=:0
PAMName=login
TTYPath=/dev/tty1
ExecStart=/usr/bin/xinit /home/kiosk/.xsession -- :0
Restart=always

[Install]
WantedBy=graphical.target
```

5) Enable and start the service:

```bash
sudo systemctl enable kiosk.service
sudo systemctl start kiosk.service
```

Notes and recommendations:
- For production kiosks consider using a display manager (e.g., `lightdm`) with autologin, stricter kiosk user permissions, disabling screensavers and power management, and starting a minimal window manager (openbox/matchbox).
- Serve the `dashboard` via a local web server (e.g., `python -m http.server` or `nginx`) and point Chromium to that URL in `--app=`.
- Adjust `.topbar-hotspot` height in `dashboard/styles.css` if you need easier access on touch devices.

If you'd like, I can add a ready-to-run `config.js` example, a `docker-compose` snippet, or a more complete Debian autologin guide. Tell me which and I'll add it.