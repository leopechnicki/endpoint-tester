# Go Sample Project — endpoint-tester validation

This directory contains one minimal Go server per framework so you can run
`endpoint-tester` against real source files and verify discovery + test-generation.

## Servers

| File | Framework | Port | Method syntax | Param syntax |
|---|---|---|---|---|
| `gin_server.go` | Gin | 8080 | UPPERCASE (`GET`, `POST`) | `:param` |
| `echo_server.go` | Echo | 8081 | UPPERCASE (`GET`, `POST`) | `:param` |
| `chi_server.go` | Chi | 8082 | Title-case (`Get`, `Post`) | `{param}` |
| `nethttp_server.go` | net/http | 8083 | N/A (all-method handler) | none |

## Running endpoint-tester against each file

```bash
# From repo root

# Gin
npx endpoint-tester scan --framework gin --dir examples/go-sample/gin_server.go

# Echo
npx endpoint-tester scan --framework echo --dir examples/go-sample/echo_server.go

# Chi
npx endpoint-tester scan --framework chi --dir examples/go-sample/chi_server.go

# net/http
npx endpoint-tester scan --framework nethttp --dir examples/go-sample/nethttp_server.go
```

## What to verify

- Gin: group prefix `/api/v1` is prepended to `/products` → `/api/v1/products`
- Echo: group prefix `/api` is prepended to `/orders` → `/api/orders`
- Chi: `{param}` is normalized to `:param` in output
- Chi: nested params (`/users/{userId}/posts/{postId}`) produce two `EndpointParam` entries
- net/http: every `HandleFunc` produces one entry (method defaults to `GET`)

## Running the servers (optional — not required for scan)

```bash
cd examples/go-sample
go mod tidy
go run gin_server.go      # :8080
go run echo_server.go     # :8081
go run chi_server.go      # :8082
go run nethttp_server.go  # :8083
```
