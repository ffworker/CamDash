# CamDash on Kubernetes

## Prerequisites
- kubectl with access to a cluster (supports kubectl apply -k).
- Container runtime to build images (docker, 
erdctl, etc.).
- For remote clusters: a registry your cluster can pull from.

## Build images
`ash
docker build -t camdash-api:local api
docker build -t camdash-web:local -f dashboard/Dockerfile .
`
- Kind/minikube: kind load docker-image camdash-api:local camdash-web:local or minikube image load ....
- Remote clusters: push to a registry and update the images in k8s/deployment-api.yaml and k8s/deployment-web.yaml (or kustomize edit set image ...).

## Configure
- Secrets: edit k8s/secret-camdash.yaml (admin user/pass + CAMDASH_AUTH_SECRET).
- Camera + WebRTC: edit k8s/config-go2rtc.yaml streams and set webrtc.candidates to the external IP of the go2rtc service (LoadBalancer or node IP) plus :8555.
- Dashboard defaults: optionally tweak k8s/config-dashboard.yaml.

## Deploy
`ash
kubectl apply -k k8s
kubectl wait -n camdash --for=condition=available deploy/api deploy/web deploy/go2rtc
kubectl get svc,ingress -n camdash
`
Add a hosts entry for camdash.local pointing to the ingress/LoadBalancer IP, then open http://camdash.local/ (Admin UI: /?admin=1).

## Updating images later
`ash
kubectl set image -n camdash deploy/api api=<registry>/camdash-api:<tag>
kubectl set image -n camdash deploy/web web=<registry>/camdash-web:<tag>
`

## Overriding config from local files
Replace the ConfigMaps without editing YAML:
`ash
kubectl create configmap camdash-go2rtc --from-file=go2rtc.yaml=config/go2rtc.yml \
  -n camdash --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap camdash-dashboard-config --from-file=config.js=config/config.js \
  -n camdash --dry-run=client -o yaml | kubectl apply -f -
`
Restart deployments if needed: kubectl rollout restart deploy/api deploy/web -n camdash.

## Data & reset
- SQLite DB is on PVC camdash-data. Delete the PVC to wipe state (will also delete the underlying PV if dynamic provisioning is used).
- First-run import happens automatically when the DB is empty and both config files are mounted.

## Network notes
- go2rtc service is LoadBalancer exposing ports 1984 (HTTP), 8554 (RTSP), 8555/UDP (WebRTC). Change 	ype to NodePort if your cluster has no LoadBalancer.
- Ingress routes HTTP to the web service only; media flows through the go2rtc service using the candidate you set.
