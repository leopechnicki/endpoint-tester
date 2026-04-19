import { describe, it, expect } from "vitest";
import { NestJSAdapter } from "../../src/adapters/nestjs.js";

describe("NestJSAdapter", () => {
  const adapter = new NestJSAdapter();

  it("should detect @Get() decorator", () => {
    const source = `
      @Controller('users')
      class UsersController {
        @Get()
        findAll() {
          return [];
        }
      }
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/users");
  });

  it("should detect @Post() with sub-path", () => {
    const source = `
      @Controller('users')
      class UsersController {
        @Post('create')
        create() {
          return {};
        }
      }
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("POST");
    expect(endpoints[0].path).toBe("/users/create");
  });

  it("should detect all HTTP method decorators", () => {
    const source = `
      @Controller('items')
      class ItemsController {
        @Get()
        findAll() {}

        @Post()
        create() {}

        @Put(':id')
        update() {}

        @Delete(':id')
        remove() {}

        @Patch(':id')
        patch() {}
      }
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints).toHaveLength(5);
    expect(endpoints.map(e => e.method).sort()).toEqual(["DELETE", "GET", "PATCH", "POST", "PUT"]);
  });

  it("should extract path parameters", () => {
    const source = `
      @Controller('users')
      class UsersController {
        @Get(':id')
        findOne(@Param('id') id: string) {
          return {};
        }
      }
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].path).toBe("/users/:id");
    const pathParams = endpoints[0].params.filter(p => p.location === "path");
    expect(pathParams).toHaveLength(1);
    expect(pathParams[0].name).toBe("id");
  });

  it("should detect @Query() parameters", () => {
    const source = `
      @Controller('users')
      class UsersController {
        @Get()
        findAll(@Query('page') page: number, @Query('limit') limit: number) {
          return [];
        }
      }
    `;
    const endpoints = adapter.parse(source, "test.ts");
    const queryParams = endpoints[0].params.filter(p => p.location === "query");
    expect(queryParams).toHaveLength(2);
    expect(queryParams.map(p => p.name)).toContain("page");
    expect(queryParams.map(p => p.name)).toContain("limit");
  });

  it("should detect @Body() with DTO class", () => {
    const source = `
      class CreateUserDto {
        name: string;
        email: string;
        age: number;
      }

      @Controller('users')
      class UsersController {
        @Post()
        create(@Body() body: CreateUserDto) {
          return {};
        }
      }
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].body).toBeDefined();
    expect(endpoints[0].body!.fields).toHaveProperty("name");
    expect(endpoints[0].body!.fields).toHaveProperty("email");
    expect(endpoints[0].body!.fields).toHaveProperty("age");
    expect(endpoints[0].body!.fields!.age).toBe("number");
  });

  it("should handle controller without prefix", () => {
    const source = `
      @Controller()
      class AppController {
        @Get('health')
        health() {
          return { status: 'ok' };
        }
      }
    `;
    // Controller() with no args has empty string prefix
    const endpoints = adapter.parse(source, "test.ts");
    // No @Controller with string arg, so no prefix detected
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe("/health");
  });

  it("should detect handler name", () => {
    const source = `
      @Controller('users')
      class UsersController {
        @Get()
        findAll() {
          return [];
        }
      }
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].handler).toBe("findAll");
  });

  it("should infer response fields from return statement", () => {
    const source = `
      @Controller('users')
      class UsersController {
        @Get(':id')
        findOne() {
          return { id: 1, name: "test", email: "test@example.com" };
        }
      }
    `;
    const endpoints = adapter.parse(source, "test.ts");
    expect(endpoints[0].response).toBeDefined();
    expect(endpoints[0].response!.fields).toHaveProperty("id");
    expect(endpoints[0].response!.fields).toHaveProperty("name");
    expect(endpoints[0].response!.fields).toHaveProperty("email");
  });
});
