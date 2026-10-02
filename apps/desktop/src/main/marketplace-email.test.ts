import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("electron", () => ({
  net: { fetch: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false }
}));
import { MarketplaceClient } from "./marketplace-client";
import {
  MarketplaceEmailLoginInputSchema,
  MarketplaceLoginInputSchema,
  MarketplaceRegisterInputSchema
} from "@deepwrite/contracts";
const roots: string[] = [];
const user = {
  id: "test-user",
  username: "test-user",
  display_name: "测试用户",
  avatar_url: "",
  bio: "",
  created_at: "2026-09-15T00:00:00.000Z"
};
const token = "dw_user_invalid-test-only";
const json = (data: unknown) => Response.json({ data });
async function setup(
  handler: (url: string, init?: RequestInit) => Promise<Response>
) {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-email-"));
  roots.push(root);
  const fetcher = vi.fn(async (url: string, init?: RequestInit) =>
    url.endsWith("/auth/login")
      ? json({ user, token, expires_at: "2099-01-01T00:00:00.000Z" })
      : handler(url, init)
  );
  return {
    client: new MarketplaceClient(root, {
      baseUrl: "https://example.test",
      fetcher,
      secureStorage: {
        isEncryptionAvailable: () => false,
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString()
      }
    }),
    fetcher
  };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});
it("requires email and a six-digit string for new registration", () => {
  const input = { username: "test-user", password: "invalid-password" };
  expect(MarketplaceRegisterInputSchema.safeParse(input).success).toBe(false);
  expect(
    MarketplaceRegisterInputSchema.safeParse({
      ...input,
      email: "test@example.test",
      emailCode: "12345"
    }).success
  ).toBe(false);
  expect(
    MarketplaceRegisterInputSchema.parse({
      ...input,
      email: " Test@Example.test ",
      emailCode: "012345"
    }).email
  ).toBe("test@example.test");
});
it("accepts username or email with a password and validates code login", () => {
  expect(
    MarketplaceLoginInputSchema.parse({
      email: " Test@Example.test ",
      password: "invalid-password"
    })
  ).toEqual({ email: "test@example.test", password: "invalid-password" });
  expect(
    MarketplaceLoginInputSchema.safeParse({
      username: "test-user",
      email: "test@example.test",
      password: "invalid-password"
    }).success
  ).toBe(false);
  expect(
    MarketplaceEmailLoginInputSchema.parse({
      email: " Test@Example.test ",
      emailCode: "012345"
    })
  ).toEqual({ email: "test@example.test", emailCode: "012345" });
  expect(
    MarketplaceEmailLoginInputSchema.safeParse({
      email: "test@example.test",
      emailCode: "12345"
    }).success
  ).toBe(false);
});
it("routes password and code email login without exposing session tokens", async () => {
  const { client, fetcher } = await setup(async (url) =>
    url.endsWith("/auth/login/code")
      ? json({ user, token, expires_at: "2099-01-01T00:00:00.000Z" })
      : json({ expires_in: 300, retry_after: 60 })
  );
  await client.login({
    email: " Test@Example.test ",
    password: "invalid-password"
  });
  expect(JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body))).toEqual({
    email: "test@example.test",
    password: "invalid-password"
  });
  await client.sendEmailCode({
    email: "Test@Example.test",
    purpose: "login"
  });
  const sent = fetcher.mock.calls.at(-1);
  expect(sent?.[0]).toBe(
    "https://example.test/market/v1/auth/login/email-code"
  );
  expect(new Headers(sent?.[1]?.headers).has("Authorization")).toBe(false);
  const session = await client.loginWithEmailCode({
    email: " Test@Example.test ",
    emailCode: "012345"
  });
  const redeemed = fetcher.mock.calls.at(-1);
  expect(redeemed?.[0]).toBe("https://example.test/market/v1/auth/login/code");
  expect(new Headers(redeemed?.[1]?.headers).has("Authorization")).toBe(false);
  expect(JSON.parse(String(redeemed?.[1]?.body))).toEqual({
    email: "test@example.test",
    email_code: "012345"
  });
  expect(JSON.stringify(session)).not.toContain(token);
});
it("routes registration codes anonymously and binding codes with the current account token", async () => {
  const { client, fetcher } = await setup(async () =>
    json({ expires_in: 300, retry_after: 60 })
  );
  expect(
    await client.sendEmailCode({
      email: " Test@Example.test ",
      purpose: "register"
    })
  ).toEqual({ expiresIn: 300, retryAfter: 60 });
  const first = fetcher.mock.calls[0];
  expect(first?.[0]).toBe(
    "https://example.test/market/v1/auth/register/email-code"
  );
  expect(new Headers(first?.[1]?.headers).has("Authorization")).toBe(false);
  expect(JSON.parse(String(first?.[1]?.body))).toEqual({
    email: "test@example.test"
  });
  await client.login({ username: "test-user", password: "invalid-password" });
  await client.sendEmailCode({
    email: "test@example.test",
    purpose: "account"
  });
  const last = fetcher.mock.calls.at(-1);
  expect(last?.[0]).toBe("https://example.test/market/v1/me/email-code");
  expect(new Headers(last?.[1]?.headers).get("Authorization")).toBe(
    `Bearer ${token}`
  );
});
it("binds a legacy user without changing identity or leaking credentials", async () => {
  const verified = {
    ...user,
    email: "test@example.test",
    email_verified_at: user.created_at
  };
  const { client, fetcher } = await setup(async () => json(verified));
  const legacy = await client.login({
    username: "test-user",
    password: "invalid-password"
  });
  expect(legacy.user?.emailVerifiedAt).toBeUndefined();
  const session = await client.bindEmail({
    email: "test@example.test",
    emailCode: "012345"
  });
  expect(session.user).toMatchObject({
    id: legacy.user?.id,
    emailVerifiedAt: user.created_at
  });
  expect(JSON.stringify(session)).not.toContain(token);
  expect(fetcher.mock.calls.at(-1)?.[1]?.method).toBe("PUT");
  expect(JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body))).toEqual({
    email: "test@example.test",
    email_code: "012345"
  });
});
it("does not restore an old binding response after logout", async () => {
  let resolve: (response: Response) => void = () => undefined;
  const late = new Promise<Response>((done) => {
    resolve = done;
  });
  const { client } = await setup(async (url) =>
    url.endsWith("/me/email") ? late : new Response(null, { status: 204 })
  );
  await client.login({ username: "test-user", password: "invalid-password" });
  const binding = client.bindEmail({
    email: "test@example.test",
    emailCode: "012345"
  });
  const failed = expect(binding).rejects.toThrow("登录状态已变化");
  await client.logout();
  resolve(
    json({
      ...user,
      email: "test@example.test",
      email_verified_at: user.created_at
    })
  );
  await failed;
  expect((await client.session()).authenticated).toBe(false);
});
it.each([
  [400, "invalid_email_code", "验证码错误或已过期"],
  [429, "email_send_limited", "发送过于频繁"],
  [503, "email_service_unavailable", "邮件服务暂不可用"]
])(
  "maps email HTTP %s errors to safe feedback",
  async (status, code, message) => {
    const { client } = await setup(async () =>
      Response.json(
        { error: { code, message: "invalid-test-sensitive-data" } },
        { status: Number(status) }
      )
    );
    await expect(
      client.sendEmailCode({ email: "test@example.test", purpose: "register" })
    ).rejects.toThrow(String(message));
  }
);
