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
  });

  it("should return exactly 5 built-in frameworks", () => {
    const frameworks = getAvailableFrameworks();
    expect(frameworks).toHaveLength(5);
  });

  it("should return an array of Framework enum values", () => {
    const frameworks = getAvailableFrameworks();
    const validValues = Object.values(Framework);

    for (const fw of frameworks) {
      expect(validValues).toContain(fw);
    }
  });
});
