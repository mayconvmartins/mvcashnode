---
name: Add Creator Tracking to Orders
overview: Add a `created_by` column to `TradeJob` to identify the source of each order (Manual, Webhook, System, etc.) and display it in the frontend. This will help debug why duplicate orders are created on restart.
todos:
  - id: db-schema
    content: Add created_by to Prisma schema and generate client
    status: completed
  - id: domain-logic
    content: Update TradeJobService to support createdBy
    status: completed
    dependencies:
      - db-schema
  - id: update-manual
    content: Update PositionsController (Manual Orders)
    status: completed
    dependencies:
      - domain-logic
  - id: update-webhook
    content: Update WebhookEventService (Webhook Orders)
    status: completed
    dependencies:
      - domain-logic
  - id: update-monitor
    content: Update SLTPMonitor (Auto Orders)
    status: completed
    dependencies:
      - domain-logic
  - id: update-frontend
    content: Update Frontend Table to show Creator
    status: completed
    dependencies:
      - domain-logic
---

