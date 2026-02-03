# CamDash

CamDash is a lightweight CCTV dashboard for kiosk/monitoring screens. It shows live WebRTC tiles, supports slide cycling, and keeps configuration in a small API with SQLite storage.

## What you get
- Kiosk-first UI with hidden topbar
- Auto grid layouts (1-6 cams per slide)
- Auto page cycling (30/60/90s)
- Admin UI to add cameras and build slideshows
- Central config stored in SQLite (not browser storage)

## Quick start (Docker)
1) Copy the env template and fill it:
   ```bash
   cp .env.example .env
   # edit admin password, secrets, ports, paths
   ```
2) Copy the camera template and fill your streams:
   ```bash
   cp config/go2rtc.example.yml config/go2rtc.yml
   # edit per-camera RTSP URLs and LAN candidate
   ```
   (Optional) adjust UI defaults in `config/config.js`.
3) Launch everything:
   ```bash
   docker compose up -d --build
   ```
4) Open the UI: `http://<host>:${HTTP_PORT:-8080}/`
   - Admin UI: `http://<host>:${HTTP_PORT:-8080}/?admin=1` or press `Ctrl + Shift + A`.

## Config layout (single place)
All editable, deployment-specific files live in `config/` and are git-ignored:
- `.env` (copied from `.env.example`): runtime env vars for API, ports, import paths.
- `config/go2rtc.yml`: RTSP/WebRTC sources for go2rtc.
- `config/config.js`: dashboard defaults (UI labels/theme + optional local pages).
- `config/go2rtc.example.yml`, `config/config.example.js`: templates for new installs.

Runtime mounts:
- go2rtc reads `config/go2rtc.yml` (mounted to `/config/go2rtc.yaml`).
- API imports from `config/go2rtc.yml` + `config/config.js` on first start if the DB is empty.
- Nginx serves the same `config/config.js` to the browser (overlays `dashboard/config.js`).

## Key environment variables (`.env`)
- `CAMDASH_DB` (default `/data/camdash.db`)
- `CAMDASH_PORT` (default `3000`)
- `CAMDASH_MAX_CAMS` (default `20` in template)
- `CAMDASH_ADMIN_USER` / `CAMDASH_ADMIN_PASS` (set your own!)
- `CAMDASH_AUTH_SECRET` (session signing secret)
- `CAMDASH_IMPORT_GO2RTC` / `CAMDASH_IMPORT_CONFIG` (defaults to `/config/...`)
- `CAMDASH_IMPORT_PROFILE` (profile name for first import)
- `CAMDASH_GO2RTC_HOST` / `CAMDASH_GO2RTC_PORT` (override go2rtc host; leave empty to use nginx proxy)
- Host ports: `HTTP_PORT`, `GO2RTC_HTTP_PORT`, `GO2RTC_RTSP_PORT`, `GO2RTC_WEBRTC_PORT`

## Import / backup
Import your filled `config/config.js` + `config/go2rtc.yml` into the DB (reset + replace slides):
```bash
node api/import-config.js --go2rtc config/go2rtc.yml --config config/config.js --db data/camdash.db --reset --replace --profile "Default"
```
Container version:
```bash
docker compose run --rm api node /app/import-config.js --go2rtc /config/go2rtc.yml --config /config/config.js --db /data/camdash.db --reset --replace --profile "Default"
```

## Admin login
The API enforces basic auth only when `CAMDASH_ADMIN_USER` and `CAMDASH_ADMIN_PASS` are set. Defaults in `.env.example` are placeholders—change them before exposing the service. Seeded fallback users (when the DB is empty):
- admin / your `CAMDASH_ADMIN_PASS` (or `change-me` if unset)
- video / video
- kiosk / kiosk

## Auto import on first run
If the DB is empty, the API imports streams from `config/go2rtc.yml` and pages from `config/config.js` into the profile named in `CAMDASH_IMPORT_PROFILE` (default `Default`). Remove those env vars or the mounted files to disable auto-import.

## go2rtc host configuration (WebRTC)
Default: browsers use the same-origin `/api` proxy via nginx, so direct access to go2rtc signaling is not required. If you want direct access, set `CAMDASH_GO2RTC_HOST`/`CAMDASH_GO2RTC_PORT`.

Expose ports (see `.env`):
- `GO2RTC_HTTP_PORT` -> 1984 (signaling/UI)
- `GO2RTC_RTSP_PORT` -> 8554 (optional)
- `GO2RTC_WEBRTC_PORT` -> 8555 (media)

Add a LAN candidate in `config/go2rtc.yml`:
```yaml
webrtc:
  listen: ":8555"
  candidates:
    - "<LAN-IP-OF-HOST>:8555" # example: 172.17.1.55
```

## Troubleshooting
- Empty UI after pull: create `.env` and `config/go2rtc.yml`, then `docker compose up -d --build`.
- No cameras: the DB is empty—use Admin UI or re-run the import command above.
- API offline: check `docker compose ps` and `/camdash-api/health`.
- WebRTC stuck on "connecting": ensure port 8555 is reachable and a correct LAN candidate is set; many browsers require HTTPS or localhost for WebRTC.

## Known limitations
- Passwords are plaintext in the DB; add hashing/stronger auth before Internet exposure.
- No CSRF protection; consider moving the token to an HttpOnly cookie with a CSRF token.
- No per-camera recording links yet.
- WebRTC only; ensure candidates/firewall rules.
- TLS termination not included; put HTTPS in front of nginx if needed.

## Other docs
- German readme: `README.de.md`
- Kiosk setup: `kiosk-setup.md`

## License
MIT. See `LICENSE`.
