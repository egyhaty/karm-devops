FROM golang:tip-alpine3.22

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o app .

ENV APP_VERSION=1.26.0

EXPOSE 8080

CMD ["./app"]
