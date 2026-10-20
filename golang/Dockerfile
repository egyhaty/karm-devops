FROM node:24-alpine AS content
WORKDIR /content
COPY content/package*.json ./
RUN npm ci --ignore-scripts
COPY content/ ./
RUN node build.mjs

FROM golang:1.27.2-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.24

RUN addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app
WORKDIR /app
COPY --from=builder --chown=10001:10001 /out/server /app/server
COPY --chown=10001:10001 web/ /app/web/
COPY --from=content --chown=10001:10001 /web/ /app/web/

ENV LISTEN_ADDRESS=:8080 \
    WEB_DIRECTORY=/app/web \
    COOKIE_SECURE=true

USER 10001:10001
EXPOSE 8080 9090
ENTRYPOINT ["/app/server"]
