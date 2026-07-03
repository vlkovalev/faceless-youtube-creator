# Setup Checklist

## Before You Start

- Create a test Google Sheet or Airtable base.
- Create a Make.com scenario workspace.
- Create a test email account or sandbox sender.
- Prepare 3-5 test leads.
- Confirm you have permission to process any lead data you use.

## Required Variables

- `LEAD_SOURCE_URL`
- `GOOGLE_SHEET_ID`
- `OPENAI_API_KEY`
- `EMAIL_SENDER_NAME`
- `EMAIL_SENDER_ADDRESS`
- `SLACK_OR_TELEGRAM_WEBHOOK_URL`
- `CRM_WEBHOOK_URL`

## Import / Rebuild Steps

1. Open Make.com.
2. Create a new scenario.
3. Import the blueprint JSON if your Make.com account supports import.
4. If import does not work, recreate each module manually from the module list.
5. Replace every placeholder value.
6. Connect your Google Sheets, email, CRM, and alert tool accounts.
7. Run one test lead.
8. Confirm the personalized draft is accurate.
9. Confirm no private keys or test credentials appear in outputs.
10. Turn scheduling on only after QA passes.

## QA Before Going Live

- The trigger receives a test lead.
- The lead is stored in the correct sheet or CRM.
- The enrichment step does not hallucinate facts.
- The outreach draft references a real company signal.
- The email draft is reviewed before sending.
- Alerts go to the correct channel.
- Errors are captured and logged.
- No API key, token, or private webhook is visible.
- The workflow can be paused quickly.

## Recommended First Test

Use a fake lead:

- Company: Example Systems
- Contact: Alex Morgan
- Role: Operations Manager
- Website: https://example.com
- Pain point: manual follow-up

Do not test with real customer data until the workflow has passed QA.
