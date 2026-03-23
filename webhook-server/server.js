const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);
const crmWebhookUrl = (process.env.CRM_WEBHOOK_URL || "").trim();
const crmAuthHeader = (process.env.CRM_WEBHOOK_AUTH_HEADER || "").trim();
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
    crmForwardingEnabled: Boolean(crmWebhookUrl)
  });
});

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

  if (!crmWebhookUrl) {
    return res.status(200).json({
      ok: true,
      forwarded: false,
      message: "Lead received. CRM_WEBHOOK_URL is not configured yet."
    });
  }

  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (crmAuthHeader) {
      headers.Authorization = crmAuthHeader;
    }

    const novaPayload = {
      phone: normalizedLead.phone,
      "date-limite": normalizedLead.deadline,
      typedeprojet: normalizedLead.documentType,
      service: normalizedLead.documentType,
      pages: normalizedLead.pages,
      currency: "EUR",
      Email: normalizedLead.email,
      Site: "redaction-de-memoire.pro",
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

    const crmResponse = await fetch(crmWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(novaPayload)
    });

    if (!crmResponse.ok) {
      const crmBody = await crmResponse.text();
      console.error("CRM_FORWARD_FAILED", crmResponse.status, crmBody);
      return res.status(502).json({
        ok: false,
        forwarded: false,
        error: `CRM returned ${crmResponse.status}`
      });
    }

    return res.status(200).json({ ok: true, forwarded: true });
  } catch (error) {
    console.error("CRM_FORWARD_ERROR", error);
    return res.status(500).json({
      ok: false,
      forwarded: false,
      error: "Failed to forward to CRM"
    });
  }
});

app.listen(port, () => {
  console.log(`lead-webhook-server listening on :${port}`);
});
