FROM golang:1.27.3-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /bridge .

FROM alpine:3.22
LABEL com.longbeach.whatsapp.transport="v1" \
    com.longbeach.whatsapp.schema="whatsapp_transport" \
    com.longbeach.whatsapp.schema.version="1" \
    com.longbeach.whatsapp.sqlstore.version="16"
RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 65532 bridge \
    && adduser -S -D -H -u 65532 -G bridge -s /sbin/nologin bridge
COPY --from=build /bridge /usr/local/bin/whatsapp-bridge
USER 65532:65532
EXPOSE 8091
ENTRYPOINT ["whatsapp-bridge"]
