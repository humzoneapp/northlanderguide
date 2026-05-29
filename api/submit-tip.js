/* ==================================================================
   Vercel serverless function: receive a traveller tip and write it to
   the Airtable Stop Tips table. The Airtable key stays server-side
   (read from environment variables), so it is never exposed to the
   browser. Submitted tips land unapproved and only appear after review.

   REQUIRED Vercel environment variables (Project Settings > Environment
   Variables):
     AIRTABLE_API_KEY   the Airtable Personal Access Token
     AIRTABLE_BASE_ID   the base id (app...)
   ================================================================== */

const STOP_TIPS_TABLE = 'tbluHMNsRouU4RbE6';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const key = process.env.AIRTABLE_API_KEY;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!key || !base) {
    res.status(500).json({ error: 'Tip submission is not configured.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const tip = String(body.tip || '').trim().slice(0, 200);
  const stop = String(body.stop || '').trim().slice(0, 80);
  const name = String(body.name || '').trim().slice(0, 80);

  if (!tip || !stop) {
    res.status(400).json({ error: 'A tip and a stop are required.' });
    return;
  }

  try {
    const r = await fetch(`https://api.airtable.com/v0/${base}/${STOP_TIPS_TABLE}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{
          fields: {
            'Tip': tip,
            'Stop': stop,
            'Submitted By': name,
            'Submission Date': new Date().toISOString().slice(0, 10)
          }
        }],
        typecast: true
      })
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      res.status(502).json({ error: 'Could not save tip', detail: t.slice(0, 300) });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
