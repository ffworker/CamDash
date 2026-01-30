# CamDash

CamDash is a lightweight CCTV dashboard for kiosk and monitoring screens. It shows live HLS tiles, supports page cycling, and can be centrally configured through a small API and SQLite database.

## What you get
- Kiosk-first UI with hidden topbar
- 1-6 cameras per slide (auto grid)
- Auto page cycling (30/60/90s)
- Admin UI to add cameras and build slideshows
- Central config stored in SQLite (not browser storage)

## Architecture
- `dashboard/` static UI (kiosk)
- `api/` Node + SQLite API (config storage)
- `go2rtc` (optional) to proxy/convert RTSP -> HLS
- `nginx` serves the UI and proxies API + go2rtc

## Installation and run (Docker)
Prerequisites:
- Docker + Docker Compose
- (Optional) go2rtc running via the included compose service

Start everything:
```bash
docker compose up -d --build
```

What starts:
- `go2rtc` (RTSP -> HLS, optional but recommended)
- `api` (CamDash config storage)
- `nginx` (serves UI + proxies API + go2rtc)

Open the UI:
- http://<host>:8080/

Admin UI (choose one):
- http://<host>:8080/?admin=1
- `Ctrl + Shift + A` in the browser

## Central config (docker-compose.yml)
All runtime settings live in the `api` service `environment` block:
- `CAMDASH_DB=/data/camdash.db`
- `CAMDASH_PORT=3000`
- `CAMDASH_IMPORT_GO2RTC=/config/go2rtc.yml`
- `CAMDASH_IMPORT_CONFIG=/config/config.js`
- `CAMDASH_IMPORT_PROFILE=Default`
- `CAMDASH_MAX_CAMS=6`
- `CAMDASH_ADMIN_USER=admin`
- `CAMDASH_ADMIN_PASS=29Logserv75`
- (optional) `CAMDASH_GO2RTC_HOST` / `CAMDASH_GO2RTC_PORT` to bypass the nginx `/api` proxy and talk to go2rtc directly.

> No `.env` file is required; edit `docker-compose.yml` to change settings.


## Impport-Settings 
```bash
docker run --rm -v "$(pwd)":/work -w /work node:20 node api/import-config.js --reset --replace --profile "Default"
```

## Admin login
The admin UI is protected by basic login (API). Defaults (from `docker-compose.yml`):
- user: `admin`
- pass: `29Logserv75`

Change them directly in `docker-compose.yml` (`CAMDASH_ADMIN_USER` / `CAMDASH_ADMIN_PASS`).

## Admin UI workflow
1) Add cameras (name, location, source)
2) Create a profile (slideshow)
3) Create slides and assign up to 6 cameras per slide
4) Set the profile active

Changes are stored in `./data/camdash.db`.

## Configuration (dashboard/config.js)
Key options:
- `go2rtcBase`: base URL for HLS (`http://<server>:1984`) or empty for `/api`
- `dataSource.mode`: `remote` (DB) or `local` (use `pages` below)
- `dataSource.apiBase`: API base path (`/camdash-api`)
- `dataSource.refreshSeconds`: refresh interval for remote state
- `ui.*`: display toggles, labels, theme overrides
- `hls.*`: Hls.js tuning
- `pages`: local fallback pages (used only if `dataSource.mode = "local"`)

## Import existing config
Import your current `dashboard/config.js` + `go2rtc.yml` into the DB:
```bash
node api/import-config.js --reset --replace --profile "Default"
```

Container version:
```bash
docker compose run --rm api node /app/import-config.js --reset --replace --profile "Default"
```

> Note: No `.env` file is required; all runtime settings are defined in `docker-compose.yml`.

## Auto import on first run
If `go2rtc.yml` exists and the DB is empty, the API will auto-import streams on startup. It also reads `dashboard/config.js` (if present) to keep camera names and slide groupings aligned with your config.

Docker Compose already wires this by mounting the files and setting:
- `CAMDASH_IMPORT_GO2RTC=/config/go2rtc.yml`
- `CAMDASH_IMPORT_CONFIG=/config/config.js`
- `CAMDASH_IMPORT_PROFILE=Default`

To disable auto import, remove those env vars/volumes or delete `go2rtc.yml` before the first start.

## Where the admin page lives
Default URL:
- http://<host>:8080/?admin=1

Keyboard shortcut:
- `Ctrl + Shift + A`

Options:
- `--go2rtc <path>` (default `./go2rtc.yml`)
- `--config <path>` (default `./dashboard/config.js`)
- `--db <path>` (default `./data/camdash.db`)
- `--profile <name>` (default `Default`)
- `--reset` wipe DB
- `--replace` replace slides in existing profile
- `--dry-run` print summary

## go2rtc
If you use go2rtc, define streams in `go2rtc.yml` and reference the stream ID in the camera source (e.g., `einfahrt_2`).

## go2rtc host configuration
Default (recommended): the dashboard uses the same-origin `/api` proxy handled by nginx, so browsers never need direct access to go2rtc.

- Leave `CAMDASH_GO2RTC_HOST` and `CAMDASH_GO2RTC_PORT` **unset** to use the proxy.
- If you want the dashboard to hit go2rtc directly (e.g., no nginx in front), set the env vars in the API container:
  ```yaml
  # in docker-compose.yml (api service)
  environment:
    - CAMDASH_GO2RTC_HOST=host.docker.internal  # or the go2rtc hostname/IP
    - CAMDASH_GO2RTC_PORT=1984
  ```

## Troubleshooting
- No cameras after git pull: the DB is empty. Use Admin UI or import.
- API offline: check `docker compose ps` and `/camdash-api/health`.
- HLS unsupported: ensure Hls.js loads or use Safari/native HLS.

## Known limitations / TODO
- Passwords are plaintext; add hashing and stronger auth if exposing to untrusted networks.
- No CSRF protection (token in Authorization header; keep as-is or move to HttpOnly cookie with CSRF token).
- No per-camera recording links yet.
- No WebRTC fallback; HLS only.
- Upgrade HTTP -> HTTPS (terminate TLS at nginx).

## Security note
Auth is disabled unless `CAMDASH_ADMIN_USER` and `CAMDASH_ADMIN_PASS` are set. The Docker Compose defaults set them, so change those values before exposing CamDash outside a trusted network.

## Other docs
- German readme: `README.de.md`
- Kiosk setup: `kiosk-setup.md`

## License
MIT. See `LICENSE`.
