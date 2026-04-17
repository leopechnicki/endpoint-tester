import { describe, it, expect } from "vitest";
import { FastAPIAdapter } from "../../src/adapters/fastapi.js";

describe("FastAPIAdapter — edge cases", () => {
  const adapter = new FastAPIAdapter();

  describe("multi-line decorators", () => {
    it("should parse decorator with response_model on next line", () => {
      const source = `
@app.get(
    "/users",
    response_model=List[User]
)
async def get_users():
    return []
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("GET");
      expect(endpoints[0].path).toBe("/users");
      expect(endpoints[0].handler).toBe("get_users");
    });

    it("should parse decorator with many kwargs", () => {
      const source = `
@router.post(
    "/items",
    response_model=Item,
    status_code=201,
    tags=["items"],
    summary="Create an item"
)
async def create_item(item: ItemCreate):
    pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("POST");
      expect(endpoints[0].path).toBe("/items");
      expect(endpoints[0].handler).toBe("create_item");
    });

    it("should parse multi-line decorator with path params", () => {
      const source = `
@app.get(
    "/users/{user_id}/posts/{post_id}",
    response_model=Post
)
async def get_user_post(user_id: int, post_id: int):
    pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].path).toBe("/users/:user_id/posts/:post_id");
      expect(endpoints[0].params).toHaveLength(2);
    });
  });

  describe("complex real-world patterns", () => {
    it("should handle multiple routers with different prefixes", () => {
      const source = `
user_router = APIRouter(prefix="/api/v1/users")
post_router = APIRouter(prefix="/api/v1/posts")

@user_router.get("/")
async def list_users():
    pass

@user_router.get("/{user_id}")
async def get_user(user_id: int):
    pass

@post_router.get("/")
async def list_posts():
    pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(3);
      expect(endpoints[0].path).toBe("/api/v1/users/");
      expect(endpoints[1].path).toBe("/api/v1/users/:user_id");
      expect(endpoints[2].path).toBe("/api/v1/posts/");
    });

    it("should handle sync def functions", () => {
      const source = `
@app.get("/sync-endpoint")
def sync_handler():
    return {"sync": True}
`;
      const endpoints = adapter.parse(source);
      expect(endpoints[0].handler).toBe("sync_handler");
    });

    it("should handle multiple decorators on same function", () => {
      const source = `
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/ready")
async def readiness():
    return {"ready": True}
`;
      const endpoints = adapter.parse(source);
      expect(endpoints).toHaveLength(2);
    });

    it("should handle all HTTP methods", () => {
      const source = `
@app.get("/r")
async def h1(): pass

@app.post("/r")
async def h2(): pass

@app.put("/r")
async def h3(): pass

@app.delete("/r")
async def h4(): pass

@app.patch("/r")
async def h5(): pass
`;
      const endpoints = adapter.parse(source);
      expect(endpoints).toHaveLength(5);
      expect(endpoints.map((e) => e.method)).toEqual(["GET", "POST", "PUT", "DELETE", "PATCH"]);
    });
  });
});
