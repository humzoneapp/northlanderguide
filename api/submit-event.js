/* ==================================================================
   Vercel serverless function: receive a community event submission
   and write it to the Airtable Events table with Approved = false.

   Mirrors api/submit-tip.js: honeypot + dual-confirm checkboxes, all
   secrets server-side, gracefully validates and trims every input.

   REQUIRED Vercel environment variables:
     AIRTABLE_API_KEY
     AIRTABLE_BASE_ID
   ================================================================== */

const EVENTS_TABLE = 'tblPPmCZ7gBlvNGk2';

const VALID_STOPS = new Set([
  'Toronto Union', 'Langstaff', 'Gormley', 'Washago', 'Gravenhurst',
  'Bracebridge', 'Huntsville', 'South River', 'Temagami', 'North Bay',
  'Temiskaming Shores', 'Englehart', 'Kirkland Lake', 'Matheson',
  'Timmins', 'Cochrane'
]);

const VALID_CATEGORIES = new Set([
  'Music & Live Performance', 'Food & Drink', 'Outdoor & Adventure',
  'Arts & Culture', 'Festivals & Fairs', 'Markets & Shopping',
  'Sports & Recreation', 'Community & Family', 'History & Heritage'
]);

const isIsoDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUrl = s => {
  if (typeof s !== 'string' || !s) return false;
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch (e) { return false; }
};
const isEmail = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const key = process.env.AIRTABLE_API_KEY;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!key || !base) {
    res.status(500).json({ error: 'Event submission is not configured.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  /* Honeypot: silent drop. */
  if (body.url && String(body.url).trim().length) {
    res.status(200).json({ ok: true });
    return;
  }
  if (body.human !== true || body.consent !== true) {
    res.status(400).json({ error: 'Please confirm both checkboxes before submitting.' });
    return;
  }

  const name = String(body.name || '').trim().slice(0, 200);
  const stop = String(body.stop || '').trim();
  const startDate = String(body.startDate || '').trim();
  const description = String(body.description || '').trim().slice(0, 2000);
  const submitterEmail = String(body.submitterEmail || '').trim().toLowerCase().slice(0, 200);

  if (!name) { res.status(400).json({ error: 'Event name is required.' }); return; }
  if (!VALID_STOPS.has(stop)) { res.status(400).json({ error: 'A valid stop is required.' }); return; }
  if (!isIsoDate(startDate)) { res.status(400).json({ error: 'Start date is required (YYYY-MM-DD).' }); return; }
  if (!description) { res.status(400).json({ error: 'Description is required.' }); return; }
  if (!isEmail(submitterEmail)) { res.status(400).json({ error: 'A valid email is required.' }); return; }

  const fields = {
    'Event Name': name,
    'Stop': stop,
    'Start Date': startDate,
    'Description': description,
    'Submitter Email': submitterEmail,
    'Source': 'Community Submission',
    'Approved': false
  };

  const category = String(body.category || '').trim();
  if (category && VALID_CATEGORIES.has(category)) fields['Category'] = category;

  const endDate = String(body.endDate || '').trim();
  if (endDate && isIsoDate(endDate)) fields['End Date'] = endDate;

  const startTime = String(body.startTime || '').trim().slice(0, 40);
  if (startTime) fields['Start Time'] = startTime;
  const endTime = String(body.endTime || '').trim().slice(0, 40);
  if (endTime) fields['End Time'] = endTime;

  const venue = String(body.venue || '').trim().slice(0, 200);
  if (venue) fields['Venue Name'] = venue;
  const address = String(body.address || '').trim().slice(0, 300);
  if (address) fields['Address'] = address;

  const imageUrl = String(body.imageUrl || '').trim();
  if (imageUrl && isUrl(imageUrl)) fields['Image URL'] = imageUrl;
  const eventUrl = String(body.eventUrl || '').trim();
  if (eventUrl && isUrl(eventUrl)) fields['Event URL'] = eventUrl;
  const ticketUrl = String(body.ticketUrl || '').trim();
  if (ticketUrl && isUrl(ticketUrl)) fields['Ticket URL'] = ticketUrl;

  const price = String(body.price || '').trim().slice(0, 80);
  if (price) fields['Price'] = price;
  if (body.free === true) fields['Free'] = true;

  const submittedBy = String(body.submittedBy || '').trim().slice(0, 200);
  if (submittedBy) fields['Submitted By'] = submittedBy;

  try {
    const r = await fetch(`https://api.airtable.com/v0/${base}/${EVENTS_TABLE}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }], typecast: true })
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      res.status(502).json({ error: 'Could not save event', detail: t.slice(0, 300) });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
