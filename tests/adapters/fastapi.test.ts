import { describe, it, expect } from "vitest";
import { FastAPIAdapter } from "../../src/adapters/fastapi.js";

describe("FastAPIAdapter", () => {
  const adapter = new FastAPIAdapter();

  it("should parse @app.get decorator", () => {
    const source = `
@app.get("/users")
async def get_users():
    return []
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
    expect(endpoints[0].handler).toBe("get_users");
  });

  it("should parse @app.post decorator", () => {
    const source = `
@app.post("/users")
async def create_user():
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/users");
  });

  it("should parse path parameters and normalize to :param", () => {
    const source = `
@app.get("/users/{user_id}")
async def get_user(user_id: int):
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/users/:user_id");
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].name).toBe("user_id");
    expect(endpoints[0].params[0].location).toBe("path");
  });

  it("should detect router prefix from APIRouter", () => {
    const source = `
router = APIRouter(prefix="/api/v1")

@router.get("/items")
async def list_items():
    return []
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/api/v1/items");
  });

  it("should parse multiple routes", () => {
    const source = `
@app.get("/users")
async def list_users():
    pass

@app.post("/users")
async def create_user():
    pass

@app.delete("/users/{user_id}")
async def delete_user(user_id: int):
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(3);
    expect(endpoints.map((e) => e.method)).toEqual(["GET", "POST", "DELETE"]);
  });

  it("should handle sync def functions", () => {
    const source = `
@app.get("/health")
def health_check():
    return {"status": "ok"}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].handler).toBe("health_check");
  });

  it("should include file path and line number", () => {
    const source = `@app.get("/test")
async def test_endpoint():
    pass`;
    const endpoints = adapter.parse(source, "app/main.py");

    expect(endpoints[0].file).toBe("app/main.py");
    expect(endpoints[0].line).toBe(1);
  });

  it("should return empty array for non-FastAPI code", () => {
    const source = `
def hello():
    print("hello world")
`;
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(0);
  });
});
