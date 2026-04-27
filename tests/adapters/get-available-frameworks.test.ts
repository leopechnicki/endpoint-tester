import { describe, it, expect } from "vitest";
import { getAvailableFrameworks } from "../../src/adapters/index.js";
import { Framework } from "../../src/types.js";

describe("getAvailableFrameworks", () => {
  it("should return all registered frameworks", () => {
    const frameworks = getAvailableFrameworks();

    expect(frameworks).toContain(Framework.Express);
    expect(frameworks).toContain(Framework.FastAPI);
    expect(frameworks).toContain(Framework.Spring);
    expect(frameworks).toContain(Framework.Django);
    expect(frameworks).toContain(Framework.Flask);
    expect(frameworks).toContain(Framework.Fastify);
    expect(frameworks).toContain(Framework.Koa);
    expect(frameworks).toContain(Framework.NestJS);
  });

  it("should return exactly 12 built-in frameworks", () => {
    const frameworks = getAvailableFrameworks();
    expect(frameworks).toHaveLength(12);
  });

  it("should include all Go frameworks", () => {
    const frameworks = getAvailableFrameworks();
    expect(frameworks).toContain(Framework.Gin);
    expect(frameworks).toContain(Framework.Echo);
    expect(frameworks).toContain(Framework.Chi);
    expect(frameworks).toContain(Framework.NetHttp);
  });

  it("should return an array of Framework enum values", () => {
    const frameworks = getAvailableFrameworks();
    const validValues = Object.values(Framework);

    for (const fw of frameworks) {
      expect(validValues).toContain(fw);
    }
  });
});
