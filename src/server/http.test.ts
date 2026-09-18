import { describe, expect, it } from "vitest";
import { guardMutation, readInput, rateLimit, clientIp } from "./http";
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
describe("clientIp", () => {
  const proxied = (forwarded?: string) =>
    new Request("http://localhost/api/test", {
      headers: forwarded ? { "x-forwarded-for": forwarded } : {},
    });
  it("memakai clientAddress saat tidak ada X-Forwarded-For", () => {
    expect(clientIp(proxied(), "127.0.0.1")).toBe("127.0.0.1");
  });
  it("memakai IP yang ditambahkan proxy, bukan yang dikirim pengunjung", () => {
    expect(clientIp(proxied("1.2.3.4, 203.0.113.9"), "127.0.0.1")).toBe(
      "203.0.113.9",
    );
  });
  it("kembali ke clientAddress saat header kosong", () => {
    expect(clientIp(proxied("   "), "127.0.0.1")).toBe("127.0.0.1");
  });
});
