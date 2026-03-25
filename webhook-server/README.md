# Lead Webhook Server

Simple endpoint for your landing form:
- receives lead data from site form
- validates basic fields
- optionally forwards lead to your CRM webhook
- optionally forwards lead to your Google Sheets webhook

## Endpoints

- `GET /health`
- `POST /webhook/lead`

## Payload from landing form

```json
{
  "lead": {
    "documentType": "Mémoire de Master",
    "pages": 80,
    "deadline": "48 heures",
    "email": "client@example.com"
  },
  "meta": {
    "sourcePage": "https://redaction-de-memoire.pro/",
    "submittedAt": "2026-03-23T10:00:00.000Z",
    "userAgent": "Mozilla/5.0 ..."
  }
}
```

## Setup

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Configure `.env`:
   - `PORT=8080`
   - `ALLOWED_ORIGIN=https://redaction-de-memoire.pro`
   - `CRM_WEBHOOK_URL=` your CRM incoming webhook URL
   - `CRM_WEBHOOK_AUTH_HEADER=` optional `Bearer ...`
   - `GOOGLE_SHEETS_WEBHOOK_URL=` your Google Apps Script `.../exec` URL
4. Run server:
   - `npm start`

## Connect the landing form

In `index.html` and `landing-redesign.html` set:

```html
<form id="leadForm" data-webhook-url="https://YOUR-WEBHOOK-DOMAIN/webhook/lead">
```

Replace `https://YOUR-WEBHOOK-DOMAIN` with your deployed domain.

## CRM Integration

When `CRM_WEBHOOK_URL` is set, this server forwards normalized lead events to CRM as JSON.
When `GOOGLE_SHEETS_WEBHOOK_URL` is set, it also forwards the same payload to Google Apps Script.
If neither is set, server still accepts and logs leads (`LEAD_RECEIVED`) so you can test safely first.
