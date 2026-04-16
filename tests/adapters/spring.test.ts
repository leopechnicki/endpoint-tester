import { describe, it, expect } from "vitest";
import { SpringAdapter } from "../../src/adapters/spring.js";

describe("SpringAdapter", () => {
  const adapter = new SpringAdapter();

  it("should parse @GetMapping", () => {
    const source = `
@GetMapping("/users")
public ResponseEntity getUsers() {
    return userService.findAll();
}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
    expect(endpoints[0].handler).toBe("getUsers");
  });

  it("should parse @PostMapping", () => {
    const source = `
@PostMapping("/users")
public User createUser(@RequestBody User user) {
    return userService.save(user);
}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/users");
  });

  it("should parse @PutMapping and @DeleteMapping", () => {
    const source = `
@PutMapping("/users/{id}")
public User updateUser(@PathVariable Long id) {
    return null;
}

@DeleteMapping("/users/{id}")
public void deleteUser(@PathVariable Long id) {
}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].method).toBe("PUT");
    expect(endpoints[0].path).toBe("/users/:id");
    expect(endpoints[1].method).toBe("DELETE");
  });

  it("should parse @RequestMapping with method", () => {
    const source = `
@RequestMapping("/items", method = RequestMethod.GET)
public List<Item> getItems() {
    return itemService.findAll();
}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/items");
  });

  it("should detect class-level @RequestMapping prefix", () => {
    const source = `
@RequestMapping("/api/v1")
public class UserController {

    @GetMapping("/users")
    public List<User> getUsers() {
        return userService.findAll();
    }
}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/api/v1/users");
  });

  it("should extract path parameters", () => {
    const source = `
@GetMapping("/users/{userId}/posts/{postId}")
public Post getPost(@PathVariable Long userId, @PathVariable Long postId) {
    return null;
}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints[0].params).toHaveLength(2);
    expect(endpoints[0].params[0].name).toBe("userId");
    expect(endpoints[0].params[1].name).toBe("postId");
  });

  it("should handle Kotlin fun syntax", () => {
    const source = `
@GetMapping("/health")
fun healthCheck(): ResponseEntity<String> {
    return ResponseEntity.ok("UP")
}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].handler).toBe("healthCheck");
  });

  it("should parse @GetMapping with value parameter", () => {
    const source = `
@GetMapping(value = "/status")
public String getStatus() {
    return "ok";
}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/status");
  });

  it("should handle no-arg @GetMapping", () => {
    const source = `
@GetMapping
public String index() {
    return "index";
}
`;
    const endpoints = adapter.parse(source);

    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/");
  });

  it("should return empty array for non-Spring code", () => {
    const source = `
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}
`;
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(0);
  });
});
