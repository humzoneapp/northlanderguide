/* ==================================================================
   Vercel serverless function: receive a traveller tip (with an optional
   photo) and write it to the Airtable Stop Tips table.

   Tips arrive unapproved; an admin reviews them in Airtable and ticks
   the Approved checkbox. The Airtable key stays server-side, read from
   environment variables, so it is never exposed to the browser.

   REQUIRED Vercel environment variables (Project Settings >
   Environment Variables):
     AIRTABLE_API_KEY   the Airtable Personal Access Token
     AIRTABLE_BASE_ID   the base id (app...)
   ================================================================== */

const STOP_TIPS_TABLE = 'tbluHMNsRouU4RbE6';
const IMAGE_FIELD = 'Image';

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

  /* Honeypot: a real visitor never fills the hidden 'url' field. If it
     arrives populated, treat the submission as a bot and discard it
     silently with a 200 so the bot does not learn that it failed. */
  if (body.url && String(body.url).trim().length) {
    res.status(200).json({ ok: true });
    return;
  }
  /* Required user confirmations. */
  if (body.human !== true || body.consent !== true) {
    res.status(400).json({ error: 'Please confirm both checkboxes before submitting.' });
    return;
  }

  const tip = String(body.tip || '').trim().slice(0, 200);
  const stop = String(body.stop || '').trim().slice(0, 80);
  const name = String(body.name || '').trim().slice(0, 80);

  if (!tip || !stop) {
    res.status(400).json({ error: 'A tip and a stop are required.' });
    return;
  }

  /* Optional image: client sends { base64, contentType, filename } */
  let image = body.image && typeof body.image === 'object' ? body.image : null;
  if (image) {
    const contentType = String(image.contentType || '').toLowerCase();
    if (!/^image\/(jpe?g|png|webp)$/.test(contentType)) {
      res.status(400).json({ error: 'Image must be JPEG, PNG, or WebP.' });
      return;
    }
    const b64 = String(image.base64 || '');
    if (!b64 || b64.length > 5_500_000) {
      res.status(400).json({ error: 'Image is too large (max about 4 MB after resize).' });
      return;
    }
    image = { base64: b64, contentType, filename: String(image.filename || 'tip.jpg').slice(0, 80) };
  }

  try {
    /* Step 1: create the tip record. */
    const createRes = await fetch(`https://api.airtable.com/v0/${base}/${STOP_TIPS_TABLE}`, {
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
    if (!createRes.ok) {
      const t = await createRes.text().catch(() => '');
      res.status(502).json({ error: 'Could not save tip', detail: t.slice(0, 300) });
      return;
    }
    const created = await createRes.json();
    const recordId = (created.records && created.records[0] && created.records[0].id) || null;
    if (!recordId) {
      res.status(502).json({ error: 'Tip saved but record id missing' });
      return;
    }

    /* Step 2: if an image was sent, attach it to the record via
       Airtable's content upload endpoint. Failure here should NOT
       lose the tip text, so we report the partial state. */
    if (image && recordId) {
      const upRes = await fetch(
        `https://content.airtable.com/v0/${base}/${recordId}/${IMAGE_FIELD}/uploadAttachment`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentType: image.contentType,
            filename: image.filename,
            file: image.base64
          })
        }
      );
      if (!upRes.ok) {
        const t = await upRes.text().catch(() => '');
        res.status(200).json({ ok: true, imageError: t.slice(0, 200) });
        return;
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
