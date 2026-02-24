# Build frontend
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build backend
FROM golang:1.25-alpine AS backend
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY *.go ./
COPY --from=frontend /app/frontend/build ./frontend/build
RUN CGO_ENABLED=0 go build -o cpg-explorer .

# Runtime
FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=backend /app/cpg-explorer /usr/local/bin/
EXPOSE 8080
ENTRYPOINT ["cpg-explorer"]
