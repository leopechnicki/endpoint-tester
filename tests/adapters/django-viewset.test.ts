import { describe, it, expect } from "vitest";
import { DjangoAdapter } from "../../src/adapters/django.js";

describe("DjangoAdapter — ViewSet CRUD inference", () => {
  const adapter = new DjangoAdapter();

  it("should infer full CRUD methods from ModelViewSet", () => {
    const source = `
from rest_framework.viewsets import ModelViewSet

class UserViewSet(ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

urlpatterns = [
    path('users/', UserViewSet.as_view({'get': 'list', 'post': 'create'})),
]
`;
    const endpoints = adapter.parse(source);

    const methods = endpoints.map((e) => e.method).sort();
    expect(methods).toEqual(["DELETE", "GET", "PATCH", "POST", "PUT"]);
  });

  it("should infer GET-only from ReadOnlyModelViewSet", () => {
    const source = `
from rest_framework.viewsets import ReadOnlyModelViewSet

class ItemViewSet(ReadOnlyModelViewSet):
    queryset = Item.objects.all()

urlpatterns = [
    path('items/', ItemViewSet.as_view({'get': 'list'})),
]
`;
    const endpoints = adapter.parse(source);

    const methods = endpoints.map((e) => e.method);
    expect(methods).toEqual(["GET"]);
  });

  it("should still detect explicit method defs in ViewSets", () => {
    const source = `
from rest_framework.viewsets import ViewSet

class CustomViewSet(ViewSet):
    def list(self, request):
        pass
    def create(self, request):
        pass

urlpatterns = [
    path('custom/', CustomViewSet.as_view({'get': 'list', 'post': 'create'})),
]
`;
    const endpoints = adapter.parse(source);

    const methods = endpoints.map((e) => e.method).sort();
    expect(methods).toEqual(["GET", "POST"]);
  });

  it("should detect DRF class-based views with explicit get/post", () => {
    const source = `
from rest_framework.views import APIView

class UserView(APIView):
    def get(self, request):
        return Response(data)
    def post(self, request):
        return Response(data)

urlpatterns = [
    path('users/', UserView.as_view()),
]
`;
    const endpoints = adapter.parse(source);

    const methods = endpoints.map((e) => e.method).sort();
    expect(methods).toEqual(["GET", "POST"]);
  });

  it("should infer methods from CreateModelMixin", () => {
    const source = `
from rest_framework.mixins import CreateModelMixin, ListModelMixin
from rest_framework.generics import GenericAPIView

class ItemCreateView(CreateModelMixin, ListModelMixin, GenericAPIView):
    queryset = Item.objects.all()

urlpatterns = [
    path('items/', ItemCreateView.as_view()),
]
`;
    const endpoints = adapter.parse(source);

    const methods = endpoints.map((e) => e.method).sort();
    expect(methods).toEqual(["GET", "POST"]);
  });
});
