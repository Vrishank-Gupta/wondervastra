import { afterEach, describe, expect, it, vi } from "vitest";
import { devConveniences } from "@/lib/utils";

afterEach(() => vi.unstubAllEnvs());

describe("dev conveniences (simulated payment, on-screen login code)", () => {
  it("are on in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(devConveniences()).toBe(true);
  });
  it("are off in a production build by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("VV_TEST_MODE", "");
    expect(devConveniences()).toBe(false);
  });
  it("can't be switched on for a real domain, even with the test flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VV_TEST_MODE", "1");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://vastravibe.in");
    expect(devConveniences()).toBe(false);
  });
  it("are allowed for the automated tests on localhost", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VV_TEST_MODE", "1");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100");
    expect(devConveniences()).toBe(true);
  });
});
