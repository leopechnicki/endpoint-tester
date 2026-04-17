import { describe, it, expect } from "vitest";
import { DjangoAdapter } from "../../src/adapters/django.js";

describe("DjangoAdapter — edge cases", () => {
  const adapter = new DjangoAdapter();

  describe("complex path patterns", () => {
    it("should handle deeply nested typed parameters", () => {
      const source = `
urlpatterns = [
    path('orgs/<int:org_id>/teams/<int:team_id>/members/<uuid:member_id>/', views.get_member),
]
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
      expect(endpoints[0].params[1]).toEqual({
        name: "team_id",
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

    it("should handle slug type parameter", () => {
      const source = `
    path('blog/<slug:post_slug>/', views.blog_detail),
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].params[0].name).toBe("post_slug");
      expect(endpoints[0].params[0].type).toBe("string");
    });

    it("should handle path type parameter", () => {
      const source = `
    path('files/<path:file_path>/', views.serve_file),
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].params[0].name).toBe("file_path");
      expect(endpoints[0].params[0].type).toBe("string");
    });

    it("should handle simple (untyped) parameters", () => {
      const source = `
    path('items/<pk>/', views.item_detail),
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].params[0].name).toBe("pk");
      expect(endpoints[0].params[0].type).toBe("string");
    });
  });

  describe("re_path patterns", () => {
    it("should handle re_path with multiple named groups", () => {
      const source = `
    re_path(r'^archive/(?P<year>\\d{4})/(?P<month>\\d{2})/$', views.archive),
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].params).toHaveLength(2);
      expect(endpoints[0].params[0].name).toBe("year");
      expect(endpoints[0].params[1].name).toBe("month");
    });

    it("should handle re_path without r prefix", () => {
      const source = `
    re_path('^users/(?P<id>\\d+)/$', views.user_detail),
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].params[0].name).toBe("id");
    });
  });

  describe("handler references", () => {
    it("should handle deeply dotted view references", () => {
      const source = `
    path('api/v1/users/', myapp.views.api.user_list),
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].handler).toBe("user_list");
    });

    it("should handle simple function name without dots", () => {
      const source = `
    path('health/', health_check),
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].handler).toBe("health_check");
    });
  });

  describe("many URL patterns in one file", () => {
    it("should parse a large urlpatterns list", () => {
      const source = `
urlpatterns = [
    path('', views.index),
    path('users/', views.user_list),
    path('users/<int:pk>/', views.user_detail),
    path('users/<int:pk>/posts/', views.user_posts),
    path('posts/', views.post_list),
    path('posts/<int:pk>/', views.post_detail),
    path('posts/<int:pk>/comments/', views.post_comments),
    path('health/', views.health),
]
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(8);
      expect(endpoints[0].path).toBe("/");
      expect(endpoints[7].handler).toBe("health");
    });
  });

  describe("empty and non-Django source", () => {
    it("should return empty for completely empty source", () => {
      const endpoints = adapter.parse("");
      expect(endpoints).toHaveLength(0);
    });

    it("should return empty for regular Python code", () => {
      const source = `
class UserModel:
    def save(self):
        pass
`;
      const endpoints = adapter.parse(source);
      expect(endpoints).toHaveLength(0);
    });
  });

  describe("path normalization", () => {
    it("should normalize double slashes", () => {
      const source = `
    path('api//users/', views.user_list),
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].path).toBe("/api/users/");
    });

    it("should handle empty path string", () => {
      const source = `
    path('', views.root),
`;
      const endpoints = adapter.parse(source);

      expect(endpoints[0].path).toBe("/");
    });
  });
});
