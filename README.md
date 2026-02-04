# CamDash

CamDash is a lightweight CCTV dashboard for kiosk/monitoring screens. It shows live WebRTC tiles, supports slide cycling, and keeps configuration in a small API with SQLite storage.

## What you get
- Kiosk-first UI with hidden topbar
- Auto grid layouts (1-6 cams per slide)
- Auto page cycling (30/60/90s)
- Admin UI to add cameras and build slideshows
- Central config stored in SQLite (not browser storage)

## Quick start (Kubernetes)
1) Build and tag images (adjust registry/tag as needed):
   ```bash
   docker build -t camdash-api:local api
   docker build -t camdash-web:local -f dashboard/Dockerfile .
   ```
   For remote clusters, push these tags to your registry and update the images in `k8s/deployment-*.yaml` or run `kustomize edit set image`.
2) Configure before deploy:
   - Edit `k8s/secret-camdash.yaml` with your admin credentials and auth secret.
   - Edit `k8s/config-go2rtc.yaml` with your RTSP URLs and set `webrtc.candidates` to the external IP:8555 of the `go2rtc` service (LoadBalancer or node IP).
   - Optional: tweak UI defaults in `k8s/config-dashboard.yaml`.
3) Deploy:
   ```bash
   kubectl apply -k k8s
   kubectl wait -n camdash --for=condition=available deploy/api deploy/web deploy/go2rtc
   ```
4) Access:
   ```bash
   kubectl get svc -n camdash
   kubectl get ingress -n camdash
   ```
   Add a hosts entry for `camdash.local` pointing to your ingress/LoadBalancer IP, then open `http://camdash.local/` (Admin UI: `/?admin=1` or `Ctrl+Shift+A`).

## Config layout (single place)
Kubernetes now owns runtime configuration:
- `k8s/config-go2rtc.yaml`: go2rtc stream + candidate config (ConfigMap `camdash-go2rtc` mounted at `/config/go2rtc.yaml`).
- `k8s/config-dashboard.yaml`: dashboard defaults served as `/usr/share/nginx/html/config.js`.
- `k8s/secret-camdash.yaml`: admin user/pass + auth secret (mounted as env vars).
- SQLite DB lives on PVC `camdash-data` mounted at `/data` in the API pod.

Legacy `config/` and `.env` remain as references/templates but are not used by the Kubernetes manifests.

## Key environment variables (`.env`)
Values set in `k8s/deployment-api.yaml` (override as needed):
- `CAMDASH_DB` (`/data/camdash.db`), `CAMDASH_PORT` (`3000`), `CAMDASH_MAX_CAMS`
- `CAMDASH_ADMIN_USER` / `CAMDASH_ADMIN_PASS` / `CAMDASH_AUTH_SECRET` (from `Secret`)
- `CAMDASH_IMPORT_GO2RTC` (`/config/go2rtc.yaml`), `CAMDASH_IMPORT_CONFIG` (`/config/config.js`), `CAMDASH_IMPORT_PROFILE`
- `CAMDASH_GO2RTC_HOST` (`go2rtc` service), `CAMDASH_GO2RTC_PORT` (`1984`)

## Import / backup
Import your filled config into the running pod (reset + replace slides):
```bash
kubectl exec -n camdash deploy/api -- node /app/import-config.js \\\
  --go2rtc /config/go2rtc.yaml --config /config/config.js --db /data/camdash.db \\\
  --reset --replace --profile \"Default\"
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
    - "<EXTERNAL-IP-OF-go2rtc-SERVICE>:8555" # example: 34.118.10.55 or node IP
```

## Troubleshooting
- Pods: `kubectl get pods -n camdash` then `kubectl logs -n camdash deploy/web|deploy/api|deploy/go2rtc`.
- No cameras: the DB is empty—use Admin UI or re-run the import command above.
- API offline: check `/camdash-api/health` via the web pod or port-forward `kubectl port-forward -n camdash svc/api 3000:3000`.
- WebRTC stuck on "connecting": verify the `go2rtc` service external IP/port 8555 is reachable and matches the candidate in `k8s/config-go2rtc.yaml`; browsers often require HTTPS or localhost for WebRTC.

## Known limitations
- Passwords are plaintext in the DB; add hashing/stronger auth before Internet exposure.
- No CSRF protection; consider moving the token to an HttpOnly cookie with a CSRF token.
- No per-camera recording links yet.
- WebRTC only; ensure candidates/firewall rules.
- TLS termination not included; put HTTPS in front of nginx if needed.

## Other docs
- German readme: `README.de.md`
- Kiosk setup: `kiosk-setup.md`
- Legacy Docker Compose has been replaced by Kubernetes manifests in `k8s/`. The `docker-compose.yml` is left only for reference.

## License
MIT. See `LICENSE`.
