# CamDash (Deutsch)

CamDash ist ein leichtgewichtiges CCTV-Dashboard fuer Kiosk- und Monitoring-Screens. Es zeigt Live-WebRTC-Kacheln (kein HLS), unterstuetzt automatisches Durchblaettern der Slides und speichert Konfigurationen zentral in einer SQLite-DB.

*Hinweis: Die Docker-Compose-Variante wurde durch Kubernetes-Manifeste ersetzt (`k8s/`).*

## Schnellstart (Kubernetes)
1) Images bauen (Tags nach Bedarf anpassen):
   ```bash
   docker build -t camdash-api:local api
   docker build -t camdash-web:local -f dashboard/Dockerfile .
   ```
2) Konfiguration anpassen:
   - `k8s/secret-camdash.yaml`: Admin-User/Passwort + `CAMDASH_AUTH_SECRET` setzen.
   - `k8s/config-go2rtc.yaml`: RTSP-Streams eintragen, `webrtc.candidates` auf externe IP:8555 des `go2rtc`-Services setzen.
   - Optional: `k8s/config-dashboard.yaml` fuer UI-Defaults.
3) Deployen:
   ```bash
   kubectl apply -k k8s
   kubectl wait -n camdash --for=condition=available deploy/api deploy/web deploy/go2rtc
   kubectl get svc,ingress -n camdash
   ```
4) Zugriff: Hosts-Eintrag fuer `camdash.local` auf die Ingress/LoadBalancer-IP setzen, dann `http://camdash.local/` oeffnen (Admin: `?admin=1` oder `Strg+Shift+A`).

## Konfiguration an einem Ort
- `k8s/config-go2rtc.yaml` (ConfigMap `camdash-go2rtc`, Mount: `/config/go2rtc.yaml`)
- `k8s/config-dashboard.yaml` (ConfigMap `camdash-dashboard-config`, Mount: `/usr/share/nginx/html/config.js`)
- `k8s/secret-camdash.yaml` (Admin-Zugang + Auth-Secret als Env Vars)
- SQLite-DB liegt auf PVC `camdash-data` (`/data` im API-Pod)
Legacy `config/` und `.env` bleiben als Templates, werden aber von den Kubernetes-Manifeste nicht benutzt.

## Import
Aktuelle Dateien in die DB importieren (ersetzen + reset):
```bash
kubectl exec -n camdash deploy/api -- node /app/import-config.js \
  --go2rtc /config/go2rtc.yaml --config /config/config.js --db /data/camdash.db \
  --reset --replace --profile "Default"
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
      - "<EXTERNE-IP-DES-go2rtc-SERVICE>:8555"
  ```

## Weitere Dokumente
- English default: `README.md`
- Kiosk-Setup: `kiosk-setup.md`

