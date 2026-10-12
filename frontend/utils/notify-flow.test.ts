import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const logDbError = vi.fn();
vi.mock("@/utils/log", () => ({ logDbError: (...args: unknown[]) => logDbError(...args) }));

import { NotifyError, deliver, notifyLocale, sendEmail, type Email } from "./notify-flow";

const KEY = "nf_test_secret_key_never_logged";
const RESET_URL = "https://example.test/reset-password?token=live-token-never-logged";

const email: Email = {
  template: "password-reset",
  to: "athlete@example.test",
  locale: "it",
  variables: { name: "Ana", resetUrl: RESET_URL },
  idempotencyKey: "reset:user-1:1700000000000",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("NOTIFY_FLOW_URL", "https://notify.example.test/");
  vi.stubEnv("NOTIFY_FLOW_API_KEY", KEY);
  vi.stubEnv("NOTIFY_FLOW_APP_NAME", "Faixa BJJ");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  logDbError.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function failure(promise: Promise<unknown>): Promise<NotifyError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(NotifyError);
  return error as NotifyError;
}

describe("sendEmail", () => {
  it("queues through the async contract and returns the id", async () => {
    fetchMock.mockResolvedValue(json(202, { id: "msg_1", status: "queued" }));

    await expect(sendEmail(email)).resolves.toBe("msg_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://notify.example.test/v1/email/send");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "reset:user-1:1700000000000",
      Prefer: "respond-async",
    });
    expect(JSON.parse(init.body)).toEqual({
      template: "password-reset",
      to: "athlete@example.test",
      locale: "it",
      variables: { name: "Ana", resetUrl: RESET_URL, appName: "Faixa BJJ" },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not retry a 400", async () => {
    fetchMock.mockResolvedValue(json(400, { error: { code: "invalid_variables", message: "x" } }));
    const error = await failure(sendEmail(email));
    expect([error.status, error.code]).toEqual([400, "invalid_variables"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 429 (it wants a full minute)", async () => {
    fetchMock.mockResolvedValue(json(429, { error: { code: "rate_limited", message: "x" } }));
    const error = await failure(sendEmail(email));
    expect([error.status, error.code]).toEqual([429, "rate_limited"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 502 (the SMTP server refused it)", async () => {
    fetchMock.mockResolvedValue(json(502, { id: "msg_2", error: { code: "smtp_failed", message: "x" } }));
    const error = await failure(sendEmail(email));
    expect([error.status, error.code]).toEqual([502, "smtp_failed"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 once, with the same Idempotency-Key", async () => {
    fetchMock
      .mockResolvedValueOnce(json(500, { error: { code: "internal_error", message: "x" } }))
      .mockResolvedValueOnce(json(202, { id: "msg_3", status: "queued" }));
    await expect(sendEmail(email)).resolves.toBe("msg_3");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(email.idempotencyKey);
  });

  it("retries a 503 queue_unavailable once, with the same Idempotency-Key", async () => {
    fetchMock
      .mockResolvedValueOnce(json(503, { id: "msg_5", error: { code: "queue_unavailable", message: "x" } }))
      .mockResolvedValueOnce(json(202, { id: "msg_5", status: "queued" }));
    await expect(sendEmail(email)).resolves.toBe("msg_5");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(email.idempotencyKey);
  });

  it("does not retry smtp_misconfigured (only the administrator can fix it)", async () => {
    fetchMock.mockResolvedValue(json(500, { error: { code: "smtp_misconfigured", message: "x" } }));
    const error = await failure(sendEmail(email));
    expect([error.status, error.code]).toEqual([500, "smtp_misconfigured"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a replay of a failed send as a failure, not a success", async () => {
    fetchMock.mockResolvedValue(json(200, { id: "msg_6", status: "failed" }));
    const error = await failure(sendEmail(email));
    expect([error.status, error.code]).toEqual([200, "failed"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a replay of a send still in progress or done", async () => {
    for (const status of ["processing", "retrying", "submitted"]) {
      fetchMock.mockResolvedValueOnce(json(200, { id: "msg_7", status }));
      await expect(sendEmail(email)).resolves.toBe("msg_7");
    }
  });

  it("retries a timeout once, then reports it", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const error = await failure(sendEmail(email));
    expect([error.status, error.code]).toEqual([0, "timeout"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(email.idempotencyKey);
  });

  it("refuses to send without configuration", async () => {
    vi.stubEnv("NOTIFY_FLOW_API_KEY", "");
    const error = await failure(sendEmail(email));
    expect(error.code).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("deliver", () => {
  const logged = (spies: ReturnType<typeof vi.spyOn>[]) =>
    JSON.stringify([...spies.flatMap((s) => s.mock.calls), ...logDbError.mock.calls]);

  it("never throws, and logs only the template and the error code", async () => {
    const spies = [vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "info").mockImplementation(() => {})];
    fetchMock.mockResolvedValue(json(401, { error: { code: "unauthorized", message: `bad key ${KEY}` } }));

    await expect(deliver(email)).resolves.toBeUndefined();

    expect(logDbError).toHaveBeenCalledWith("notify", "password-reset", { code: "401 unauthorized" });
    const output = logged(spies);
    expect(output).not.toContain(KEY);
    expect(output).not.toContain("live-token-never-logged");
    expect(output).not.toContain(email.to);
  });

  it("logs the id on success, and nothing it sent", async () => {
    const spies = [vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "info").mockImplementation(() => {})];
    fetchMock.mockResolvedValue(json(202, { id: "msg_4", status: "queued" }));

    await deliver(email);

    expect(spies[1]).toHaveBeenCalledWith("[notify] password-reset msg_4 accepted");
    const output = logged(spies);
    expect(output).not.toContain(KEY);
    expect(output).not.toContain("live-token-never-logged");
  });
});

describe("notifyLocale", () => {
  it("keeps the app's languages and falls back to English", () => {
    expect(notifyLocale("it")).toBe("it");
    expect(notifyLocale("pt-BR")).toBe("pt-BR");
    expect(notifyLocale("de")).toBe("en");
    expect(notifyLocale(undefined)).toBe("en");
  });
});
