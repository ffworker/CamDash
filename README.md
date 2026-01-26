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

## Admin login
The admin UI is protected by basic login (API). Default credentials from `docker-compose.yml`:
- user: `admin`
- pass: `changeme`

Change them in `docker-compose.yml`:
```
CAMDASH_ADMIN_USER=youruser
CAMDASH_ADMIN_PASS=yourpass
```

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

## Troubleshooting
- No cameras after git pull: the DB is empty. Use Admin UI or import.
- API offline: check `docker compose ps` and `/camdash-api/health`.
- HLS unsupported: ensure Hls.js loads or use Safari/native HLS.

## Security note
The admin UI and API are not authenticated by default. If exposed outside a trusted network, add authentication or restrict access at the network/proxy level.

## License
MIT. See `LICENSE`.

---

# CamDash (Deutsch)

CamDash ist ein leichtgewichtiges CCTV-Dashboard für Kiosk‑ und Monitoring‑Screens. Es zeigt Live‑HLS‑Kacheln, unterstützt das automatische Durchblättern der Slides und speichert Konfigurationen zentral in einer SQLite‑DB.

## Installation & Start (Docker)
Voraussetzungen:
- Docker + Docker Compose
- (Optional) go2rtc über das mitgelieferte Compose‑Setup

Start:
```bash
docker compose up -d --build
```

UI öffnen:
- http://<host>:8080/

Admin‑UI öffnen:
- http://<host>:8080/?admin=1
- oder `Strg + Shift + A` im Browser

## Admin‑Login
Standard‑Zugangsdaten (aus `docker-compose.yml`):
- Benutzer: `admin`
- Passwort: `changeme`

Ändern in `docker-compose.yml`:
```
CAMDASH_ADMIN_USER=deinuser
CAMDASH_ADMIN_PASS=deinpass
```

## Admin‑Workflow
1) Kameras anlegen (Name, Ort, Quelle)
2) Profil (Slideshow) anlegen
3) Slides erstellen und Kameras zuweisen (max. 6 pro Slide)
4) Profil aktiv setzen

## Import vorhandener Konfiguration
```bash
node api/import-config.js --reset --replace --profile "Default"
```

## Debian Kiosk‑Modus (Platzhalter)
### Debian 12 + GNOME (GDM) – Firefox Kiosk (Platzhalter‑URL)
**Ziel:** GNOME startet automatisch einen Kiosk‑Benutzer und öffnet Firefox im Kiosk‑Modus.

1) Pakete installieren:
```bash
sudo apt update
sudo apt install firefox-esr gdm3
```

2) Kiosk‑Benutzer anlegen (Beispiel: `kiosk`):
```bash
sudo useradd -m -s /bin/bash kiosk
sudo passwd kiosk
```

3) GDM Autologin aktivieren (`/etc/gdm3/daemon.conf`):
```ini
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=kiosk
```

4) Autostart für Firefox Kiosk (`/home/kiosk/.config/autostart/camdash-kiosk.desktop`):
```ini
[Desktop Entry]
Type=Application
Name=CamDash Kiosk
Exec=firefox --kiosk "http://<HOST>:8080/"
X-GNOME-Autostart-enabled=true
```

5) Bildschirm‑Sperre/Blanking deaktivieren (als `kiosk` ausführen):
```bash
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing'
```

6) Neustarten:
```bash
sudo reboot
```

**Hinweis:** Ersetze die URL durch deine CamDash‑Adresse (Platzhalter).
