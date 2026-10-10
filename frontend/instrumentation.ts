// Runs once when a server instance starts. Its only job: say plainly, before
// anyone asks for a password reset, that email cannot work. Without these the
// app still runs — every send is logged as `not_configured` and skipped.
const EMAIL_ENV = [
  "NOTIFY_FLOW_URL",
  "NOTIFY_FLOW_API_KEY",
  "NOTIFY_FLOW_APP_NAME",
  "AUTH_LINK_SECRET",
] as const;

export function register() {
  const missing = EMAIL_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`[notify] email is disabled, missing: ${missing.join(", ")}`);
  } else if ((process.env.AUTH_LINK_SECRET ?? "").length < 32) {
    console.error("[notify] AUTH_LINK_SECRET is shorter than 32 characters: no link will be sent");
  }
}
