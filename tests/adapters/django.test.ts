import { describe, it, expect } from "vitest";
import { DjangoAdapter } from "../../src/adapters/django.js";

describe("DjangoAdapter", () => {
  const adapter = new DjangoAdapter();

  it("should parse path() with view function", () => {
    const source = `
urlpatterns = [
    path('users/', views.user_list, name='user-list'),
]
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users/");
    expect(endpoints[0].handler).toBe("user_list");
  });

  it("should parse path() with typed parameters", () => {
    const source = `
    path('users/<int:pk>/', views.user_detail),
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/users/:pk/");
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].name).toBe("pk");
    expect(endpoints[0].params[0].type).toBe("number");
  });

  it("should parse path() with string parameter", () => {
    const source = `
    path('articles/<str:slug>/', views.article_detail),
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/articles/:slug/");
    expect(endpoints[0].params[0].type).toBe("string");
  });

  it("should parse re_path() with named groups", () => {
    const source = `
    re_path(r'^items/(?P<id>\\d+)/$', views.item_detail),
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toContain(":id");
    expect(endpoints[0].params).toHaveLength(1);
    expect(endpoints[0].params[0].name).toBe("id");
  });

  it("should parse multiple URL patterns", () => {
    const source = `
urlpatterns = [
    path('users/', views.user_list),
    path('users/<int:pk>/', views.user_detail),
    path('posts/', views.post_list),
]
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(3);
    expect(endpoints[0].handler).toBe("user_list");
    expect(endpoints[1].handler).toBe("user_detail");
    expect(endpoints[2].handler).toBe("post_list");
  });

  it("should handle dotted view references", () => {
    const source = `
    path('api/health/', api_views.health_check),
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].handler).toBe("health_check");
  });

  it("should include file path and line number", () => {
    const source = `path('test/', views.test_view)`;
    const endpoints = adapter.parse(source, "myapp/urls.py");

    expect(endpoints[0].file).toBe("myapp/urls.py");
    expect(endpoints[0].line).toBe(1);
  });

  it("should return empty array for non-Django code", () => {
    const source = `
def hello():
    print("hello world")
`;
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(0);
  });

  describe("HTTP method inference", () => {
    it("should infer methods from class-based views", () => {
      const source = `
class UserView(APIView):
    def get(self, request):
        return Response([])

    def post(self, request):
        return Response({})

urlpatterns = [
    path('users/', UserView.as_view()),
]
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(2);
      expect(endpoints.map(e => e.method)).toEqual(["GET", "POST"]);
    });

    it("should infer methods from @api_view decorator", () => {
      const source = `
@api_view(['GET', 'POST'])
def user_list(request):
    pass

urlpatterns = [
    path('users/', user_list),
]
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].method).toBe("GET");
      expect(endpoints[1].method).toBe("POST");
    });

    it("should infer methods from @require_http_methods decorator", () => {
      const source = `
@require_http_methods(["GET", "PUT", "DELETE"])
def item_detail(request, pk):
    pass

urlpatterns = [
    path('items/<int:pk>/', item_detail),
]
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(3);
      expect(endpoints.map(e => e.method)).toEqual(["GET", "PUT", "DELETE"]);
    });

    it("should default to GET when no view class info available", () => {
      const source = `
urlpatterns = [
    path('health/', views.health_check),
]
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("GET");
    });
  });
});
