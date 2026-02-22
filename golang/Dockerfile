FROM golang:tip-alpine3.22 
WORKDIR /app 
COPY . . 
ENV APP_VERSION=1.26.0
EXPOSE 8080
CMD ["go", "run", "main.go"]