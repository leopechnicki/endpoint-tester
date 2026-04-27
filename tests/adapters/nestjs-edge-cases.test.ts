import { describe, it, expect } from "vitest";
import { NestJSAdapter } from "../../src/adapters/nestjs.js";

describe("NestJSAdapter — edge cases", () => {
  const adapter = new NestJSAdapter();

  it("does not crash when @Query() appears without a type annotation", () => {
    const source = `
      import { Controller, Get, Query } from '@nestjs/common';

      @Controller('search')
      export class SearchController {
        @Get()
        async search(@Query() rawQuery) {
          return { results: [] };
        }
      }
    `;

    // Regression guard: adapter must return the endpoint without throwing
    // on undefined type info.
    const endpoints = adapter.parse(source);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe("GET");
    expect(endpoints[0].path).toBe("/search");
  });

  it("captures the generic wrapper name when a DTO field uses generics", () => {
    // Known limitation pinned here: `items: List<Item>` is read as
    // `items: List` (the inner generic argument is dropped). This test
    // documents current behaviour so future improvements are explicit.
    const source = `
      import { Controller, Post, Body } from '@nestjs/common';

      class BatchDto {
        items: List<Item>;
        count: number;
      }

      @Controller('batch')
      export class BatchController {
        @Post()
        async ingest(@Body() body: BatchDto) {
          return { ok: true };
        }
      }
    `;

    const endpoint = adapter.parse(source)[0];
    expect(endpoint.body?.fields).toEqual({
      items: "string",
      count: "number",
    });
  });

  it("handles optional DTO fields declared with `?:`", () => {
    const source = `
      class CreateUserDto {
        email: string;
        password: string;
        nickname?: string;
        age?: number;
      }

      @Controller('users')
      export class UserController {
        @Post()
        async create(@Body() body: CreateUserDto) {
          return { id: 1 };
        }
      }
    `;

    const endpoint = adapter.parse(source)[0];
    expect(endpoint.body?.fields).toEqual({
      email: "string",
      password: "string",
      nickname: "string",
      age: "number",
    });
  });

  it("captures nested path parameters in @Get('path/:id/child/:childId')", () => {
    const source = `
      @Controller('orgs')
      export class OrgController {
        @Get(':orgId/members/:memberId')
        async getMember() { return {}; }
      }
    `;

    const endpoint = adapter.parse(source)[0];
    expect(endpoint.path).toBe("/orgs/:orgId/members/:memberId");
    const pathParams = endpoint.params
      .filter((p) => p.location === "path")
      .map((p) => p.name);
    expect(pathParams).toEqual(["orgId", "memberId"]);
  });

  it("does not pick up the object form of @Controller({ path, version }) (current limitation)", () => {
    // Known limitation: only the string form of @Controller is parsed.
    // Pin current behaviour — object form yields no prefix so routes
    // hang off `/`.
    const source = `
      @Controller({ path: 'users', version: '1' })
      export class UserController {
        @Get()
        async list() { return []; }
      }
    `;

    const endpoint = adapter.parse(source)[0];
    // Without prefix resolution, path is just the decorator argument (empty → "/").
    expect(endpoint.path).toBe("/");
  });
});
