# SpareSlot web app: a static Vite build behind nginx, which also proxies /api to the backend.
# Build context: the repository root.
#   docker build -f deploy/frontend.Dockerfile -t spareslot-web .
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
# BACKEND_ORIGIN is substituted into the template when the container starts (for example http://backend:8080)
ENV BACKEND_ORIGIN=http://backend:8080
COPY --from=build /src/dist /usr/share/nginx/html
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
