/* ==================================================================
   Vercel serverless function: receive an Airtable automation webhook
   when a Listings row meets the enrichment trigger (Business Name +
   Address filled, Auto-enriched still unchecked), then fire a
   repository_dispatch event at GitHub so the Enrich New Listing
   workflow runs for that specific recordId.

   Mirrors the api/trigger-tip-sync.js pattern: the Airtable -> Vercel
   -> GitHub hop keeps the GitHub PAT off Airtable's configuration UI.

   REQUIRED Vercel environment variables (reused from the tip sync
   plumbing where possible):
     WEBHOOK_SECRET   shared secret the Airtable webhook sends in the
                      x-webhook-secret header
     GITHUB_PAT       GitHub Personal Access Token with the "workflow"
                      scope so it can dispatch repository_dispatch
                      events
   ================================================================== */

const REPO = 'humzoneapp/northlanderguide';
const EVENT_TYPE = 'listing-needs-enrichment';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = req.headers['x-webhook-secret'];
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    res.status(500).json({ error: 'GITHUB_PAT not configured' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const recordId = String(body.recordId || '').trim();
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) {
    res.status(400).json({ error: 'recordId is required (rec...)' });
    return;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + pat,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'northlander-enrich-listing'
        },
        body: JSON.stringify({
          event_type: EVENT_TYPE,
          client_payload: { recordId }
        })
      }
    );

    if (response.ok) {
      res.status(200).json({ ok: true, recordId, message: 'Enrichment queued' });
      return;
    }
    const detail = await response.text().catch(() => '');
    res.status(502).json({
      error: 'GitHub dispatch failed',
      status: response.status,
      detail: detail.slice(0, 300)
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
