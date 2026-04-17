import { describe, it, expect } from "vitest";
import { FlaskAdapter } from "../../src/adapters/flask.js";

describe("FlaskAdapter — edge cases", () => {
  const adapter = new FlaskAdapter();

  describe("blueprint prefix handling", () => {
    it("should handle multiple blueprints with different prefixes", () => {
      const source = `
auth_bp = Blueprint('auth', __name__, url_prefix='/auth')
api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

@auth_bp.post('/login')
def login():
    pass

@auth_bp.post('/register')
def register():
    pass

@api_bp.get('/users')
def list_users():
    return []
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(3);
      expect(endpoints[0].path).toBe("/auth/login");
      expect(endpoints[1].path).toBe("/auth/register");
      expect(endpoints[2].path).toBe("/api/v1/users");
    });

    it("should handle blueprint with route() and methods", () => {
      const source = `
bp = Blueprint('main', __name__, url_prefix='/api')

@bp.route('/data', methods=['GET', 'POST', 'PUT'])
def data_handler():
    pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(3);
      expect(endpoints.map((e) => e.method)).toEqual(["GET", "POST", "PUT"]);
      expect(endpoints.every((e) => e.path === "/api/data")).toBe(true);
    });
  });

  describe("complex path parameters", () => {
    it("should handle multiple typed parameters", () => {
      const source = `
@app.get('/orgs/<int:org_id>/teams/<int:team_id>/members/<uuid:member_id>')
def get_member(org_id, team_id, member_id):
    pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].params).toHaveLength(3);
      expect(endpoints[0].params[0]).toEqual({
        name: "org_id",
        location: "path",
        type: "number",
        required: true,
      });
      expect(endpoints[0].params[2]).toEqual({
        name: "member_id",
        location: "path",
        type: "string",
        required: true,
      });
    });

    it("should handle float type parameter", () => {
      const source = `
@app.get('/location/<float:lat>/<float:lng>')
def get_location(lat, lng):
    pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].params).toHaveLength(2);
      expect(endpoints[0].params[0].type).toBe("number");
      expect(endpoints[0].params[1].type).toBe("number");
    });

    it("should handle path type parameter", () => {
      const source = `
@app.get('/files/<path:filepath>')
def get_file(filepath):
    pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].params[0].name).toBe("filepath");
      expect(endpoints[0].params[0].type).toBe("string");
    });

    it("should handle mixed typed and untyped params", () => {
      const source = `
@app.get('/users/<int:user_id>/posts/<slug>')
def get_post(user_id, slug):
    pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].params).toHaveLength(2);
      expect(endpoints[0].params[0].type).toBe("number");
      expect(endpoints[0].params[1].type).toBe("string");
    });
  });

  describe("all HTTP methods", () => {
    it("should handle all shorthand methods", () => {
      const source = `
@app.get('/r')
def h1(): pass

@app.post('/r')
def h2(): pass

@app.put('/r')
def h3(): pass

@app.delete('/r')
def h4(): pass

@app.patch('/r')
def h5(): pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(5);
      expect(endpoints.map((e) => e.method)).toEqual(["GET", "POST", "PUT", "DELETE", "PATCH"]);
    });
  });

  describe("handler detection", () => {
    it("should return <unknown> if no def follows decorator", () => {
      const source = `
@app.get('/orphan')
# this has no function def
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].handler).toBe("<unknown>");
    });

    it("should handle async def handler", () => {
      const source = `
@app.get('/async-route')
async def async_handler():
    return "ok"
`;
      const endpoints = adapter.parse(source);
      expect(endpoints[0].handler).toBe("async_handler");
    });
  });

  describe("route method with double-quoted methods list", () => {
    it("should parse methods with double quotes", () => {
      const source = `
@app.route("/items", methods=["POST", "PUT"])
def items():
    pass
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].method).toBe("POST");
      expect(endpoints[1].method).toBe("PUT");
    });
  });

  describe("empty and non-Flask source", () => {
    it("should return empty for completely empty source", () => {
      const endpoints = adapter.parse("");
      expect(endpoints).toHaveLength(0);
    });

    it("should return empty for regular Python code", () => {
      const source = `
class MyService:
    def process(self):
        return self.data
`;
      const endpoints = adapter.parse(source);
      expect(endpoints).toHaveLength(0);
    });
  });
});
