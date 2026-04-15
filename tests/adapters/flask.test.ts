import { describe, it, expect } from "vitest";
import { FlaskAdapter } from "../../src/adapters/flask.js";

describe("FlaskAdapter", () => {
  const adapter = new FlaskAdapter();

  it("should parse @app.route with default GET", () => {
    const source = `
@app.route('/users')
def get_users():
    return jsonify([])
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
    expect(endpoints[0].handler).toBe("get_users");
  });

  it("should parse @app.route with explicit methods", () => {
    const source = `
@app.route('/users', methods=['GET', 'POST'])
def users():
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[1].method).toBe("POST");
    expect(endpoints[0].handler).toBe("users");
  });

  it("should parse shorthand @app.get and @app.post", () => {
    const source = `
@app.get('/items')
def list_items():
    return []

@app.post('/items')
def create_item():
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/items");
    expect(endpoints[1].method).toBe("POST");
  });

  it("should parse typed path parameters", () => {
    const source = `
@app.get('/users/<int:user_id>')
def get_user(user_id):
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/users/:user_id");
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].name).toBe("user_id");
    expect(endpoints[0].params[0].type).toBe("number");
  });

  it("should parse simple path parameters", () => {
    const source = `
@app.get('/posts/<slug>')
def get_post(slug):
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints[0].path).toBe("/posts/:slug");
    expect(endpoints[0].params[0].name).toBe("slug");
    expect(endpoints[0].params[0].type).toBe("string");
  });

  it("should detect Blueprint url_prefix", () => {
    const source = `
bp = Blueprint('api', __name__, url_prefix='/api/v1')

@bp.get('/users')
def list_users():
    return []
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/api/v1/users");
  });

  it("should parse multiple routes", () => {
    const source = `
@app.get('/health')
def health():
    return "ok"

@app.get('/users')
def list_users():
    return []

@app.post('/users')
def create_user():
    pass

@app.delete('/users/<int:id>')
def delete_user(id):
    pass
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(4);
    expect(endpoints.map((e) => e.method)).toEqual(["GET", "GET", "POST", "DELETE"]);
  });

  it("should handle async def functions", () => {
    const source = `
@app.get('/async')
async def async_handler():
    return "ok"
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].handler).toBe("async_handler");
  });

  it("should include file path and line number", () => {
    const source = `@app.get('/test')
def test():
    pass`;
    const endpoints = adapter.parse(source, "app/routes.py");

    expect(endpoints[0].file).toBe("app/routes.py");
    expect(endpoints[0].line).toBe(1);
  });

  it("should return empty array for non-Flask code", () => {
    const source = `
def hello():
    print("hello world")
`;
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(0);
  });
});
