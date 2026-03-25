const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);
const crmWebhookUrl = (process.env.CRM_WEBHOOK_URL || "").trim();
const crmAuthHeader = (process.env.CRM_WEBHOOK_AUTH_HEADER || "").trim();
const googleSheetsWebhookUrl = (process.env.GOOGLE_SHEETS_WEBHOOK_URL || "").trim();
const allowedOrigin = (process.env.ALLOWED_ORIGIN || "*").trim();

app.use(
  cors({
    origin: allowedOrigin === "*" ? true : allowedOrigin
  })
);
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "lead-webhook-server",
    crmForwardingEnabled: Boolean(crmWebhookUrl),
    googleSheetsForwardingEnabled: Boolean(googleSheetsWebhookUrl)
  });
});

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
}

app.post("/webhook/lead", async (req, res) => {
  const lead = req.body?.lead || {};
  const meta = req.body?.meta || {};

  const normalizedLead = {
    documentType: String(lead.documentType || "").trim(),
    pages: Number(lead.pages || 0),
    deadline: String(lead.deadline || "").trim(),
    email: String(lead.email || "").trim().toLowerCase(),
    phone: String(lead.phone || "").trim()
  };

  if (!normalizedLead.email || !normalizedLead.email.includes("@")) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }

  if (!Number.isFinite(normalizedLead.pages) || normalizedLead.pages <= 0) {
    return res.status(400).json({ ok: false, error: "Invalid pages value" });
  }

  if (!normalizedLead.phone) {
    return res.status(400).json({ ok: false, error: "Invalid phone value" });
  }

  const leadEvent = {
    lead: normalizedLead,
    meta: {
      sourcePage: String(meta.sourcePage || "").trim(),
      submittedAt: String(meta.submittedAt || "").trim(),
      userAgent: String(meta.userAgent || "").trim()
    },
    receivedAt: new Date().toISOString(),
    sourceIp: req.headers["x-forwarded-for"] || req.socket.remoteAddress || null
  };

  console.log("LEAD_RECEIVED", JSON.stringify(leadEvent));

  if (!crmWebhookUrl && !googleSheetsWebhookUrl) {
    return res.status(200).json({
      ok: true,
      forwarded: false,
      message:
        "Lead received. Neither CRM_WEBHOOK_URL nor GOOGLE_SHEETS_WEBHOOK_URL is configured yet."
    });
  }

  const outboundPayload = {
    phone: normalizedLead.phone,
    "date-limite": normalizedLead.deadline,
    typedeprojet: normalizedLead.documentType,
    service: normalizedLead.documentType,
    pages: normalizedLead.pages,
    currency: "EUR",
    Email: normalizedLead.email,
    Site: "redaction-de-memoire.pro",
    site_name: "redaction-de-memoire.pro",
    original_source: "(direct)",
    original_medium: "(none)",
    original_page_url: leadEvent.meta.sourcePage,
    original_first_page_url: leadEvent.meta.sourcePage,
    source_page: leadEvent.meta.sourcePage,
    submitted_at: leadEvent.meta.submittedAt,
    source_user_agent: leadEvent.meta.userAgent,
    source_ip: leadEvent.sourceIp,
    webhook_source: "redaction-de-memoire.pro",
    webhook_source_type: "landing_form",
    raw: leadEvent
  };

  let crmForwarded = false;
  let crmError = null;
  let googleForwarded = false;
  let googleError = null;

  if (crmWebhookUrl) {
    try {
      const headers = crmAuthHeader ? { Authorization: crmAuthHeader } : {};
      await postJson(crmWebhookUrl, outboundPayload, headers);
      crmForwarded = true;
    } catch (error) {
      crmError = error.message;
      console.error("CRM_FORWARD_ERROR", error);
    }
  }

  if (googleSheetsWebhookUrl) {
    try {
      await postJson(googleSheetsWebhookUrl, outboundPayload);
      googleForwarded = true;
    } catch (error) {
      googleError = error.message;
      console.error("GOOGLE_SHEETS_FORWARD_ERROR", error);
    }
  }

  const anyForwarded = crmForwarded || googleForwarded;
  return res.status(anyForwarded ? 200 : 502).json({
    ok: anyForwarded,
    forwarded: anyForwarded,
    crmForwarded,
    googleSheetsForwarded: googleForwarded,
    crmError,
    googleSheetsError: googleError
  });
});

app.listen(port, () => {
  console.log(`lead-webhook-server listening on :${port}`);
});
