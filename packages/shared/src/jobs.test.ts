import { describe, expect, it } from "vitest";

import { redisConnectionOptions } from "./jobs";

describe("redisConnectionOptions", () => {
  it("parses a plain URL with defaults", () => {
    expect(redisConnectionOptions("redis://valkey")).toEqual({
      host: "valkey",
      port: 6379,
      username: undefined,
      password: undefined,
      db: 0,
      maxRetriesPerRequest: null,
    });
  });

  it("turns TLS on for rediss://", () => {
    expect(redisConnectionOptions("rediss://cache.example.test:6380").tls).toEqual({});
    expect(redisConnectionOptions("redis://cache.example.test:6380")).not.toHaveProperty("tls");
  });

  it("decodes credentials and reads the database number", () => {
    const options = redisConnectionOptions("redis://app:p%40ss%2Fword@cache.example.test:6379/2");
    expect(options.username).toBe("app");
    expect(options.password).toBe("p@ss/word");
    expect(options.db).toBe(2);
  });
});
