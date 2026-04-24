const RESEND_API_URL = "https://api.resend.com/emails";

export function createEmailSender(options = {}) {
  const apiKey = typeof options?.apiKey === "string" ? options.apiKey.trim() : "";
  const fromEmail = typeof options?.fromEmail === "string" && options.fromEmail.trim()
    ? options.fromEmail.trim()
    : "Jay's Arcade <onboarding@resend.dev>";
  const fetchImpl = typeof options?.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);

  return {
    isConfigured: Boolean(apiKey && fetchImpl),

    async send({ to, subject, html }) {
      if (!apiKey || typeof fetchImpl !== "function") {
        return { ok: false, error: "email_not_configured" };
      }

      try {
        const response = await fetchImpl(RESEND_API_URL, {
          method: "POST",
          headers: {
            "authorization": `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
        });

        if (!response.ok) {
          return { ok: false, error: "email_send_failed" };
        }

        return { ok: true };
      } catch {
        return { ok: false, error: "email_network_error" };
      }
    },
  };
}
