# CamDash (Deutsch)

CamDash ist ein leichtgewichtiges CCTV-Dashboard für Kiosk- und Monitoring-Screens. Es zeigt Live-HLS-Kacheln, unterstützt das automatische Durchblättern der Slides und speichert Konfigurationen zentral in einer SQLite-DB.

## Installation & Start (Docker)
Voraussetzungen:
- Docker + Docker Compose
- (Optional) go2rtc über das mitgelieferte Compose-Setup

Lokale Dateien anlegen:
- .env.example -> .env kopieren und Admin-Zugangsdaten setzen
- Bei go2rtc: go2rtc-example.yml -> go2rtc.yml kopieren und Streams pflegen
- Optional: dashboard/config.js -> dashboard/config.local.js (lokale Overrides, nicht im Repo)


Start:
```bash
docker compose up -d --build
```

UI öffnen:
- http://<host>:8080/

Admin-UI öffnen:
- http://<host>:8080/?admin=1
- oder `Strg + Shift + A` im Browser

## Admin-Login
Standard-Zugangsdaten (aus `.env.example`):
- Benutzer: `admin`
- Passwort: `changeme`

Ändern in `.env`:
```
CAMDASH_ADMIN_USER=deinuser
CAMDASH_ADMIN_PASS=deinpass
```

## Admin-Workflow
1) Kameras anlegen (Name, Ort, Quelle)
2) Profil (Slideshow) anlegen
3) Slides erstellen und Kameras zuweisen (max. 6 pro Slide)
4) Profil aktiv setzen

## Import vorhandener Konfiguration
```bash
node api/import-config.js --reset --replace --profile "Default"
```

## Weitere Dokumente
- English default: `README.md`
- Kiosk-Setup: `kiosk-setup.md`

