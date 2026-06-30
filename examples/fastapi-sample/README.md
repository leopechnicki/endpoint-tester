# FastAPI Sample — endpoint-tester

A minimal FastAPI REST API you can use to try `endpoint-tester` end-to-end.

## What's in this example

```
app/
  __init__.py
  main.py       FastAPI app with 13 endpoints across /api/users and /api/products
requirements.txt
```

The app registers:

| Method | Path | Description |
|---|---|---|
| GET | /health | Health check |
| GET | /api/users/ | List users (query: page, limit) |
| POST | /api/users/ | Create user (body: name, email, role) |
| GET | /api/users/{user_id} | Get user by id |
| PUT | /api/users/{user_id} | Update user (body: name, email) |
| DELETE | /api/users/{user_id} | Delete user |
| GET | /api/users/{user_id}/orders | Get user orders |
| GET | /api/products/ | List products |
| POST | /api/products/ | Create product (body: name, price, category) |
| GET | /api/products/{product_id} | Get product by id |
| PATCH | /api/products/{product_id} | Patch product (body: price, category) |
| DELETE | /api/products/{product_id} | Delete product |

## Step 1 — Install dependencies

```bash
# Python 3.11+ recommended
pip install -r requirements.txt

# Install endpoint-tester globally
npm install -g endpoint-tester
# or use npx (no install needed)
```

## Step 2 — Scan for endpoints

```bash
npx endpoint-tester scan ./app --framework fastapi
```

Expected output:

```
Auto-detected framework: fastapi (high confidence)
Scanning ./app for fastapi endpoints...
Found 12 endpoint(s):

  GET     /health
  GET     /api/users/
  POST    /api/users/
  GET     /api/users/{user_id}              [params: user_id]
  PUT     /api/users/{user_id}              [params: user_id]
  DELETE  /api/users/{user_id}              [params: user_id]
  GET     /api/users/{user_id}/orders       [params: user_id]
  GET     /api/products/
  POST    /api/products/
  GET     /api/products/{product_id}        [params: product_id]
  PATCH   /api/products/{product_id}        [params: product_id]
  DELETE  /api/products/{product_id}        [params: product_id]
```

## Step 3 — Generate tests

```bash
npx endpoint-tester generate ./app --framework fastapi --format pytest --output ./tests/test_api.py
```

## Step 4 — Generate OpenAPI spec

```bash
npx endpoint-tester generate ./app --framework fastapi --format openapi --output openapi.yaml
```

Note: FastAPI also exposes its own built-in OpenAPI spec at `http://localhost:8000/openapi.json`
when running. endpoint-tester derives the spec from source code only — no server required.

## Step 5 — Run tests (requires the server to be running)

In one terminal, start the server:

```bash
uvicorn app.main:app --reload --port 8000
```

In another terminal, run the generated tests:

```bash
pytest tests/test_api.py -v
```

## Step 6 — CI guard (optional)

```bash
npx endpoint-tester ci ./app --framework fastapi
```

Exits with code 1 if the endpoint count drops below the saved baseline — catches accidental route deletions in CI.

## Auto-detection

endpoint-tester detects FastAPI automatically from `requirements.txt`. No `--framework` flag
needed if `fastapi` is listed:

```bash
npx endpoint-tester scan ./app
# Auto-detected framework: fastapi (high confidence)
```
