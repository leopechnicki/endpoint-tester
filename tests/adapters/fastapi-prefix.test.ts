import { describe, it, expect } from "vitest";
import { FastAPIAdapter } from "../../src/adapters/fastapi.js";

describe("FastAPIAdapter — prefix detection with non-first kwargs", () => {
  const adapter = new FastAPIAdapter();

  it("should detect prefix when it is not the first kwarg", () => {
    const source = `
router = APIRouter(tags=["users"], prefix="/api/users")

@router.get("/")
async def list_users():
    pass

@router.get("/{user_id}")
async def get_user(user_id: int):
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].path).toBe("/api/users/");
    expect(endpoints[1].path).toBe("/api/users/:user_id");
  });

  it("should detect prefix when followed by other kwargs", () => {
    const source = `
router = APIRouter(dependencies=[Depends(auth)], prefix="/v2/items", tags=["items"])

@router.post("/")
async def create_item(item: Item):
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/v2/items/");
    expect(endpoints[0].method).toBe("POST");
  });

  it("should still detect prefix as first kwarg", () => {
    const source = `
router = APIRouter(prefix="/api/v1")

@router.get("/health")
async def health():
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/api/v1/health");
  });

  it("should handle APIRouter with no prefix", () => {
    const source = `
router = APIRouter(tags=["misc"])

@router.get("/ping")
async def ping():
    return "pong"
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/ping");
  });
});
