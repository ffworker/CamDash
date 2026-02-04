# CamDash on Kubernetes — Job Practice Guide

This is a do-and-tell script. Each step lists which job requirement(s) you satisfy, so you can say "I practiced X by doing Y."

## Skill mapping at a glance
- [ ] Kubernetes platform design/ops — steps 5, 6, 7, 10, 11, 12
- [ ] Docker/container image hygiene — steps 1, 2
- [ ] Infrastructure as Code (declarative K8s, kustomize) — steps 2, 5, 8, 11
- [ ] DevSecOps & secret management — steps 3, 14
- [ ] Networking/Ingress/Service/ports/WebRTC — steps 4, 6, 7, 10, 11
- [ ] Storage/stateful handling — step 9
- [ ] CI/CD with GitLab mindset — step 14 (talking points)
- [ ] Security automation (image/dependency scans) — step 14
- [ ] Troubleshooting/observability — steps 6, 13
- [ ] Customer enablement/clear comms — narrate steps as a repeatable runbook

Mark them off as you complete the matching steps.

## 0) Prereqs (stage setup)
- Need `kubectl` + a cluster; container builder (docker/podman/nerdctl); optional `kind`/`minikube`.
- Checks: platform basics, container know-how.

## 1) Build the images
```bash
docker build -t camdash-api:local api
docker build -t camdash-web:local -f dashboard/Dockerfile .
```
- kind/minikube: `kind load docker-image camdash-api:local camdash-web:local` or `minikube image load ...`.
- Remote: tag/push to a registry.
- Checks: Docker & clean images.

## 2) Point manifests to your images
If using a registry:
```bash
kustomize edit set image camdash-api:local=<registry>/camdash-api:<tag>
kustomize edit set image camdash-web:local=<registry>/camdash-web:<tag>
```
- Checks: IaC, image promotion hygiene.

## 3) Set secrets (DevSecOps)
Edit `k8s/secret-camdash.yaml`:
```yaml
stringData:
  CAMDASH_ADMIN_USER: your-admin
  CAMDASH_ADMIN_PASS: strong-password
  CAMDASH_AUTH_SECRET: long-random-secret
```
- Checks: secret management; discuss sealed-secrets/External Secrets as next step.

## 4) Configure streams/WebRTC
Edit `k8s/config-go2rtc.yaml`:
- Add RTSP URLs under `streams:`.
- Set `webrtc.candidates` to the reachable IP:8555 of the go2rtc Service (LB or NodePort).
- Optional UI tweaks in `k8s/config-dashboard.yaml`.
- Checks: K8s networking/ingress, media port mapping, ConfigMaps.

## 5) Deploy
```bash
kubectl apply -k k8s
kubectl wait -n camdash --for=condition=available deploy/api deploy/web deploy/go2rtc
```
- Checks: Kubernetes orchestration, rollouts.

## 6) Verify runtime state
```bash
kubectl get pods,svc,ingress -n camdash
kubectl logs -n camdash deploy/api
```
- Expect `go2rtc` LoadBalancer (1984, 8554, 8555/UDP), `web` svc:80, `api` svc:3000, ingress host `camdash.local`.
- Checks: troubleshooting, observability.

## 7) Access the app
- Hosts entry: `camdash.local` ? ingress/LB IP.
- Open `http://camdash.local/` (Admin: `/?admin=1` or Ctrl+Shift+A).
- Checks: ingress/user path validation.

## 8) Update configs without editing manifests
```bash
kubectl create configmap camdash-go2rtc --from-file=go2rtc.yaml=config/go2rtc.yml \
  -n camdash --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap camdash-dashboard-config --from-file=config.js=config/config.js \
  -n camdash --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart deploy/api deploy/web -n camdash
```
- Checks: GitOps-style changes, safe rollout.

## 9) First-run import & data
- API auto-imports `/config/go2rtc.yaml` and `/config/config.js` into SQLite `/data/camdash.db` when empty.
- PVC `camdash-data` holds DB; deleting PVC resets state.
- Checks: stateful workload handling, reset strategy.

## 10) Port-forward fallback (no ingress)
```bash
kubectl port-forward -n camdash svc/web 8080:80
kubectl port-forward -n camdash svc/api 3000:3000
kubectl port-forward -n camdash svc/go2rtc 1984:1984
```
Media still needs UDP 8555 reachable (LB/NodePort).
- Checks: access patterns without ingress.

## 11) Common tweaks to discuss
- No LB? change `service-go2rtc.yaml` to `NodePort`; set candidate to `<node-ip>:<nodeport-for-8555>`.
- Different domain? edit `ingress.yaml` host; use real DNS.
- Horizontal scaling? keep API replicas=1 with SQLite; propose Postgres + migration before scaling.
- Checks: platform design, networking, scalability trade-offs.

## 12) Reset/cleanup
```bash
kubectl delete -k k8s
kubectl delete pvc camdash-data -n camdash
```
- Checks: environment hygiene.

## 13) Troubleshooting crib
- Empty UI / "config missing": ensure ConfigMap `camdash-dashboard-config` mounts to `/usr/share/nginx/html/config.js`.
- No cameras: import manually:
  ```bash
  kubectl exec -n camdash deploy/api -- node /app/import-config.js \
    --go2rtc /config/go2rtc.yaml --config /config/config.js --db /data/camdash.db \
    --reset --replace --profile "Default"
  ```
- WebRTC stuck: is UDP 8555 reachable? candidate matches LB/node IP? firewall open?
- Images will not pull: fix image names/tags; add `imagePullSecrets` if private.
- Checks: pragmatic ops/debugging.

## 14) Optional GitLab CI/CD talking points
- Pipeline stages: build ? scan ? deploy.
- Build: `docker buildx build --push -t <registry>/camdash-api:$CI_COMMIT_SHA ...`.
- Scan: `trivy image <image>` or `grype`; `npm audit` for `api`.
- Deploy: `kubectl apply -k k8s` with a service account and kubeconfig/OIDC.
- Checks: CI/CD with security gates, GitLab DNA.

Use this to rehearse: do the step, tick the matching box above, and keep notes on results. That gives you concrete stories for the interview ("I validated ingress and media ports by …", "I handled secrets via …", etc.).
