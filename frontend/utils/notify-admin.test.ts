import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/log", () => ({ logDbError: vi.fn(), logOutcome: vi.fn() }));

import {
  checkHealth,
  deleteTemplate,
  emailStatus,
  getTemplate,
  listTemplates,
  putTemplate,
  sendTest,
} from "./notify-admin";
import { NotifyError } from "./notify-flow";

const KEY = "nf_test_secret_key_never_logged";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("NOTIFY_FLOW_URL", "https://notify.example.test/");
  vi.stubEnv("NOTIFY_FLOW_API_KEY", KEY);
  vi.stubEnv("NOTIFY_FLOW_APP_NAME", "Faixa BJJ");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function failure(promise: Promise<unknown>): Promise<NotifyError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(NotifyError);
  expect((error as Error).message).not.toContain(KEY);
  return error as NotifyError;
}

const request = (call = 0) => {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
};

describe("listTemplates", () => {
  it("reads notify-flow's list", async () => {
    fetchMock.mockResolvedValue(
      json(200, [
        { name: "email-change", locale: "it", updated_at: 1792400000, builtin: false },
        { name: "welcome", locale: "en", updated_at: null, builtin: true },
      ]),
    );
    expect(await listTemplates()).toEqual([
      { name: "email-change", locale: "it", updatedAt: new Date(1792400000 * 1000).toISOString(), builtin: false },
      { name: "welcome", locale: "en", updatedAt: null, builtin: true },
    ]);
    const { url, headers } = request();
    expect(url).toBe("https://notify.example.test/v1/templates");
    expect(headers.get("Authorization")).toBe(`Bearer ${KEY}`);
  });

  it("rejects a refused key with its status", async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: "unauthorized", message: "no" } }));
    const error = await failure(listTemplates());
    expect(error.status).toBe(401);
    expect(error.code).toBe("unauthorized");
  });

  it("says not_configured without the env, and calls nothing", async () => {
    vi.stubEnv("NOTIFY_FLOW_API_KEY", "");
    const error = await failure(listTemplates());
    expect([error.status, error.code]).toEqual([0, "not_configured"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getTemplate", () => {
  it("returns the content", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        name: "welcome",
        locale: "it",
        subject: "Ciao",
        html: "<p>{{ name }}</p>",
        text: "{{ name }}",
        variables: ["appName", "name"],
        builtin: true,
      }),
    );
    expect(await getTemplate("welcome", "it")).toEqual({
      subject: "Ciao",
      html: "<p>{{ name }}</p>",
      text: "{{ name }}",
      variables: ["appName", "name"],
      builtin: true,
    });
    expect(request().url).toBe("https://notify.example.test/v1/templates/welcome/it");
  });

  it("is null when notify-flow has none", async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: "template_not_found" } }));
    expect(await getTemplate("promo", "it")).toBeNull();
  });
});

describe("putTemplate / deleteTemplate", () => {
  it("PUTs the four fields", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    const body = { subject: "S", html: "<p>h</p>", text: "t", variables: ["appName"] };
    await putTemplate("email-change", "it", body);
    const { url, init } = request();
    expect(url).toBe("https://notify.example.test/v1/templates/email-change/it");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("DELETEs and accepts 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteTemplate("welcome", "pt-BR")).resolves.toBeUndefined();
    expect(request().init.method).toBe("DELETE");
  });

  it("reports a delete of nothing as not_found", async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: "template_not_found" } }));
    const error = await failure(deleteTemplate("welcome", "it"));
    expect([error.status, error.code]).toEqual([404, "not_found"]);
  });
});

describe("sendTest", () => {
  const email = { template: "welcome", to: "me@example.test", locale: "it" as const, variables: { name: "Mario" } };

  it("sends synchronously and returns the id and status", async () => {
    fetchMock.mockResolvedValue(json(200, { id: "msg_1", status: "submitted" }));
    expect(await sendTest(email)).toEqual({ id: "msg_1", status: "submitted" });
    const { url, init, headers } = request();
    expect(url).toBe("https://notify.example.test/v1/email/send");
    expect(headers.get("Prefer")).toBeNull();
    expect(headers.get("Idempotency-Key")).toMatch(/^test:/);
    expect(JSON.parse(init.body as string)).toEqual(email);
  });

  it("returns a refused SMTP send as failed, with its id", async () => {
    fetchMock.mockResolvedValue(json(502, { error: { code: "smtp_failed" }, id: "msg_2" }));
    expect(await sendTest(email)).toEqual({ id: "msg_2", status: "failed" });
  });

  it("maps the per-recipient limit to rate_limited", async () => {
    fetchMock.mockResolvedValue(json(429, { error: { code: "rate_limited" } }));
    const error = await failure(sendTest(email));
    expect([error.status, error.code]).toEqual([429, "rate_limited"]);
  });
});

describe("emailStatus", () => {
  it("reads the status and error code", async () => {
    fetchMock.mockResolvedValue(json(200, { id: "msg_1", status: "failed", error_code: "smtp_failed" }));
    expect(await emailStatus("msg_1")).toEqual({ status: "failed", errorCode: "smtp_failed" });
    expect(request().url).toBe("https://notify.example.test/v1/email/msg_1");
  });
});

describe("checkHealth", () => {
  it("is true on 2xx and sends no key", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    expect(await checkHealth()).toBe(true);
    expect(request().headers.get("Authorization")).toBeNull();
  });

  it("is false when the service cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await checkHealth()).toBe(false);
  });
});
