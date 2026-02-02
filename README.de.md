# CamDash (Deutsch)

CamDash ist ein leichtgewichtiges CCTV-Dashboard für Kiosk- und Monitoring-Screens. Es zeigt Live-WebRTC-Kacheln (kein HLS mehr), unterstützt das automatische Durchblättern der Slides und speichert Konfigurationen zentral in einer SQLite-DB.

## Installation & Start (Docker)
Voraussetzungen:
- Docker + Docker Compose
- (Optional) go2rtc über das mitgelieferte Compose-Setup

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
Standard-Zugangsdaten (aus `docker-compose.yml`):
- Benutzer: `admin`
- Passwort: `29Logserv75`

Ändern in `docker-compose.yml`:
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

## WebRTC-Hinweis
- Port 8555 (UDP/TCP) muss im LAN erreichbar sein.
- In `go2rtc.yml` einen LAN-Kandidaten setzen, z. B.:
  ```yaml
  webrtc:
    listen: ":8555"
    candidates:
      - "<LAN-IP-DES-HOSTS>:8555" # z. B. 172.17.1.55
  ```

## Weitere Dokumente
- English default: `README.md`
- Kiosk-Setup: `kiosk-setup.md`
