FROM node:22-alpine AS build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
RUN npm run build:admin

FROM nginx:1.27-alpine
COPY admin-web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist-admin /usr/share/nginx/html

ENV PORT=8080
ENV UPSTREAM_API_BASE_URL=http://web:8080

EXPOSE 8080

CMD ["sh", "-c", "envsubst '$PORT $UPSTREAM_API_BASE_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
