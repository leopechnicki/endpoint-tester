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

  describe("add_url_rule()", () => {
    it("should parse add_url_rule with methods", () => {
      const source = `
app.add_url_rule('/users', 'user_list', get_users, methods=['GET', 'POST'])
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].method).toBe("GET");
      expect(endpoints[1].method).toBe("POST");
      expect(endpoints[0].path).toBe("/users");
      expect(endpoints[0].handler).toBe("get_users");
    });

    it("should parse add_url_rule with view_func keyword", () => {
      const source = `
app.add_url_rule('/items', 'items', view_func=list_items)
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].handler).toBe("list_items");
    });

    it("should parse add_url_rule with path params", () => {
      const source = `
app.add_url_rule('/users/<int:id>', 'user_detail', get_user)
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].path).toBe("/users/:id");
      expect(endpoints[0].params).toHaveLength(1);
      expect(endpoints[0].params[0].name).toBe("id");
    });

    it("should parse add_url_rule with Blueprint prefix", () => {
      const source = `
bp = Blueprint('api', __name__, url_prefix='/api/v1')
bp.add_url_rule('/users', 'user_list', get_users)
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].path).toBe("/api/v1/users");
    });
  });

  describe("MethodView", () => {
    it("should detect MethodView and infer HTTP methods", () => {
      const source = `
class UserView(MethodView):
    def get(self):
        return jsonify([])

    def post(self):
        return jsonify({})

app.add_url_rule('/users', view_func=UserView.as_view('users'))
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].method).toBe("GET");
      expect(endpoints[1].method).toBe("POST");
      expect(endpoints[0].path).toBe("/users");
      expect(endpoints[0].handler).toBe("UserView");
    });

    it("should handle MethodView with async methods", () => {
      const source = `
class ItemView(MethodView):
    async def get(self):
        return jsonify([])

    async def put(self):
        return jsonify({})

    async def delete(self):
        return '', 204

app.add_url_rule('/items/<int:id>', view_func=ItemView.as_view('item'))
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(3);
      expect(endpoints.map(e => e.method)).toEqual(["GET", "PUT", "DELETE"]);
    });
  });
});
