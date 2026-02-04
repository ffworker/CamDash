FROM nginx:alpine

RUN apk upgrade --no-cache

# Static dashboard assets
COPY dashboard/ /usr/share/nginx/html/

# Nginx routes proxy /api to go2rtc and /camdash-api to the API service
COPY nginx.conf /etc/nginx/conf.d/default.conf
