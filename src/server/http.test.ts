import { describe, expect, it } from "vitest";
import { guardMutation, readInput, rateLimit } from "./http";
const request = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/test", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
describe("HTTP boundaries", () => {
  it("bounds actual UTF-8 bytes even without a declared length", async () => {
    await expect(
      readInput(request(JSON.stringify({ name: "é".repeat(9000) }))),
    ).rejects.toThrow("Data terlalu besar");
  });
  it("rejects non-object JSON and unsupported body formats", async () => {
    await expect(readInput(request("null"))).rejects.toThrow("JSON");
    await expect(
      readInput(request("{}", { "content-type": "text/plain" })),
    ).rejects.toThrow("tidak didukung");
  });
  it("rejects cross-site mutations and enforces rate limits", () => {
    expect(() =>
      guardMutation(request("{}", { origin: "https://attacker.test" })),
    ).toThrow();
    expect(() =>
      guardMutation(request("{}", { origin: "http://localhost" })),
    ).not.toThrow();
    rateLimit("test-http-rate", 1);
    expect(() => rateLimit("test-http-rate", 1)).toThrow();
  });
});
