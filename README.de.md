# CamDash (Deutsch)

CamDash ist ein leichtgewichtiges CCTV-Dashboard fuer Kiosk- und Monitoring-Screens. Es zeigt Live-WebRTC-Kacheln (kein HLS), unterstuetzt automatisches Durchblaettern der Slides und speichert Konfigurationen zentral in einer SQLite-DB.

## Schnellstart (Docker)
1) Vorlage kopieren und anpassen:
   ```bash
   cp .env.example .env
   # eigene Passwoerter/Ports setzen
   ```
2) Kameras eintragen:
   ```bash
   cp config/go2rtc.example.yml config/go2rtc.yml
   # RTSP-URLs + LAN-Kandidaten eintragen
   ```
   (Optional) `config/config.js` fuer UI/Labels anpassen.
3) Starten:
   ```bash
   docker compose up -d --build
   ```
4) UI: `http://<host>:${HTTP_PORT:-8080}/` - Admin: `?admin=1` oder `Strg + Shift + A`.

## Konfiguration an einem Ort
- `.env`: Laufzeit-Variablen (API, Ports, Import-Pfade).
- `config/go2rtc.yml`: RTSP/WebRTC-Quellen fuer go2rtc (git-ignored).
- `config/config.js`: Dashboard-Defaults/Seiten (git-ignored).
- Templates: `config/go2rtc.example.yml`, `config/config.example.js`.

Container nutzen dieselben Dateien: go2rtc liest `config/go2rtc.yml`, die API importiert beim ersten Start, und nginx liefert `config/config.js` an den Browser.

## Import
Aktuelle Dateien in die DB importieren (ersetzen + reset):
```bash
node api/import-config.js --go2rtc config/go2rtc.yml --config config/config.js --db data/camdash.db --reset --replace --profile "Default"
```
Container-Variante:
```bash
docker compose run --rm api node /app/import-config.js --go2rtc /config/go2rtc.yml --config /config/config.js --db /data/camdash.db --reset --replace --profile "Default"
```

## Admin-Login
Basic Auth ist aktiv, sobald `CAMDASH_ADMIN_USER` und `CAMDASH_ADMIN_PASS` gesetzt sind. Platzhalter in `.env.example` bitte ersetzen. Seed-User bei leerer DB: admin/<dein Passwort>, video/video, kiosk/kiosk.

## WebRTC-Hinweis
- Ports: `GO2RTC_HTTP_PORT` (1984), `GO2RTC_RTSP_PORT` (8554 optional), `GO2RTC_WEBRTC_PORT` (8555).
- In `config/go2rtc.yml` einen LAN-Kandidaten setzen, z. B.:
  ```yaml
  webrtc:
    listen: ":8555"
    candidates:
      - "<LAN-IP-DES-HOSTS>:8555"
  ```

## Weitere Dokumente
- English default: `README.md`
- Kiosk-Setup: `kiosk-setup.md`

