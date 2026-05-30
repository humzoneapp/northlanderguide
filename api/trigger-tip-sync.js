/* ==================================================================
   Vercel serverless function: receive an Airtable automation webhook
   when a Stop Tips row gets its Approved checkbox ticked, then fire a
   repository_dispatch event at GitHub so the Sync Approved Tips
   workflow runs immediately.

   The Airtable -> Vercel -> GitHub hop exists because Airtable's "Send
   a webhook" action cannot safely carry a GitHub Personal Access Token
   (it would be visible in the automation config to anyone with edit
   access to the base). The PAT lives in Vercel env vars instead.

   REQUIRED Vercel environment variables:
     WEBHOOK_SECRET   a random 32-char string that the Airtable webhook
                      sends as an x-webhook-secret header. Any request
                      that does not match this value is rejected.
     GITHUB_PAT       a GitHub Personal Access Token with the "workflow"
                      scope, used to call the dispatches endpoint.
   ================================================================== */

const REPO = 'humzoneapp/northlanderguide';
const EVENT_TYPE = 'tip-approved';

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

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + pat,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'northlander-tip-sync'
        },
        body: JSON.stringify({ event_type: EVENT_TYPE })
      }
    );

    if (response.ok) {
      res.status(200).json({ ok: true, message: 'Sync triggered' });
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
