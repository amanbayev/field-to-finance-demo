import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "./server";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
const cookieStore = { getAll: vi.fn(), set: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://factory.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-publishable-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.mocked(cookies).mockResolvedValue(cookieStore as unknown as Awaited<ReturnType<typeof cookies>>);
});
afterEach(() => vi.unstubAllEnvs());
const options = () => vi.mocked(createServerClient).mock.calls[0][2];

describe("server Supabase factory transport opt-in compatibility", () => {
  it("keeps the former options and SSR client unchanged without opt-in", async () => {
    const client = {} as ReturnType<typeof createServerClient>;
    vi.mocked(createServerClient).mockReturnValue(client);
    expect(await createServerSupabaseClient()).toBe(client);
    expect(createServerClient).toHaveBeenCalledExactlyOnceWith("https://factory.invalid", "synthetic-publishable-key", {
      cookies: { getAll: expect.any(Function), setAll: expect.any(Function) },
    });
    const all = [{ name: "synthetic-auth", value: "session" }];
    cookieStore.getAll.mockReturnValue(all);
    expect(options().cookies.getAll!()).toBe(all);
  });

  it("preserves cookie writes and options for session refresh", async () => {
    await createServerSupabaseClient();
    const cookieOptions = { httpOnly: true, secure: true, path: "/", maxAge: 3600 };
    options().cookies.setAll!([{ name: "synthetic-auth", value: "refreshed", options: cookieOptions }], {});
    expect(cookieStore.set).toHaveBeenCalledExactlyOnceWith("synthetic-auth", "refreshed", cookieOptions);
  });

  it("retains the Server Component read-only cookie fallback", async () => {
    await createServerSupabaseClient();
    cookieStore.set.mockImplementation(() => { throw new Error("Cookies are read-only here"); });
    expect(() => options().cookies.setAll!([{ name: "synthetic-auth", value: "refreshed", options: {} }], {})).not.toThrow();
  });

  it("adds only the supported custom fetch when explicitly requested", async () => {
    const intercepted = vi.fn<typeof fetch>();
    const transport = vi.fn(() => intercepted);
    await createServerSupabaseClient(transport);
    expect(transport).toHaveBeenCalledExactlyOnceWith(globalThis.fetch);
    expect(options()).toEqual({ global: { fetch: intercepted }, cookies: { getAll: expect.any(Function), setAll: expect.any(Function) } });
    expect(vi.mocked(createServerClient).mock.calls[0].slice(0, 2)).toEqual(["https://factory.invalid", "synthetic-publishable-key"]);
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])("stays unconfigured without %s and does not create a transport", async variable => {
    vi.stubEnv(variable, "");
    const transport = vi.fn();
    expect(await createServerSupabaseClient(transport)).toBeNull();
    expect(transport).not.toHaveBeenCalled();
    expect(cookies).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
