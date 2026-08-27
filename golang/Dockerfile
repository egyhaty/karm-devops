FROM golang:1.22-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/app .

FROM alpine:3.22

RUN addgroup -S -g 10001 app && \
    adduser -S -D -H -u 10001 -G app app

WORKDIR /app

COPY --from=builder /out/app /app/app

ENV APP_VERSION=dev

USER 10001:10001

EXPOSE 8080

CMD ["/app/app"]
