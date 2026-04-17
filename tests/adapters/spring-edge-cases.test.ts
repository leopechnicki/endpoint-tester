import { describe, it, expect } from "vitest";
import { SpringAdapter } from "../../src/adapters/spring.js";

describe("SpringAdapter — edge cases", () => {
  const adapter = new SpringAdapter();

  describe("class-level @RequestMapping prefix", () => {
    it("should properly combine class prefix with method path", () => {
      const source = `
@RequestMapping("/api/v1")
public class UserController {

    @GetMapping("/users")
    public List<User> getUsers() {
        return userService.findAll();
    }

    @PostMapping("/users")
    public User createUser(@RequestBody User user) {
        return userService.save(user);
    }

    @GetMapping("/users/{id}")
    public User getUser(@PathVariable Long id) {
        return userService.findById(id);
    }
}
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(3);
      expect(endpoints[0].path).toBe("/api/v1/users");
      expect(endpoints[1].path).toBe("/api/v1/users");
      expect(endpoints[2].path).toBe("/api/v1/users/:id");
    });

    it("should handle class-level prefix with value= syntax", () => {
      const source = `
@RequestMapping(value = "/api")
public class ApiController {

    @GetMapping("/status")
    public String status() { return "ok"; }
}
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].path).toBe("/api/status");
    });
  });

  describe("@RequestMapping with reversed argument order", () => {
    it("should parse method before value", () => {
      const source = `
@RequestMapping(method = RequestMethod.POST, value = "/items")
public Item createItem(@RequestBody Item item) {
    return itemService.save(item);
}
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("POST");
      expect(endpoints[0].path).toBe("/items");
    });
  });

  describe("multiline annotations", () => {
    it("should parse @RequestMapping spanning multiple lines", () => {
      const source = `
@RequestMapping(
    value = "/reports",
    method = RequestMethod.GET
)
public List<Report> getReports() {
    return reportService.findAll();
}
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("GET");
      expect(endpoints[0].path).toBe("/reports");
    });
  });

  describe("complex real-world patterns", () => {
    it("should handle multiple path variables", () => {
      const source = `
@GetMapping("/orgs/{orgId}/repos/{repoId}/branches/{branchName}")
public Branch getBranch(
    @PathVariable Long orgId,
    @PathVariable Long repoId,
    @PathVariable String branchName) {
    return null;
}
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].params).toHaveLength(3);
      expect(endpoints[0].params.map((p) => p.name)).toEqual(["orgId", "repoId", "branchName"]);
    });

    it("should handle @PatchMapping", () => {
      const source = `
@PatchMapping("/users/{id}")
public User patchUser(@PathVariable Long id, @RequestBody Map<String, Object> updates) {
    return userService.patch(id, updates);
}
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("PATCH");
    });

    it("should handle mixed annotations in same file", () => {
      const source = `
@RestController
@RequestMapping("/api")
public class MixedController {

    @GetMapping("/items")
    public List<Item> list() { return null; }

    @RequestMapping(value = "/items/search", method = RequestMethod.GET)
    public List<Item> search() { return null; }

    @PostMapping("/items")
    public Item create(@RequestBody Item item) { return null; }

    @DeleteMapping("/items/{id}")
    public void delete(@PathVariable Long id) { }
}
`;
      const endpoints = adapter.parse(source);

      expect(endpoints).toHaveLength(4);
      expect(endpoints[0].path).toBe("/api/items");
      expect(endpoints[0].method).toBe("GET");
      expect(endpoints[1].path).toBe("/api/items/search");
      expect(endpoints[1].method).toBe("GET");
      expect(endpoints[2].method).toBe("POST");
      expect(endpoints[3].method).toBe("DELETE");
    });
  });
});
