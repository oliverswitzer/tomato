export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, referrer, utm_source, utm_medium, utm_campaign } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const contact = {
    email,
    source: 'splash-download-gate',
    subscribed: true,
  };
  if (referrer) contact.referrer = referrer;
  if (utm_source) contact.utm_source = utm_source;
  if (utm_medium) contact.utm_medium = utm_medium;
  if (utm_campaign) contact.utm_campaign = utm_campaign;

  try {
    const response = await fetch('https://app.loops.so/api/v1/contacts/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LOOPS_API_KEY}`,
      },
      body: JSON.stringify(contact),
    });

    if (response.ok || response.status === 409) {
      return res.status(200).json({ ok: true });
    }

    console.error('Loops API error:', response.status, await response.text());
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Loops API request failed:', err);
    return res.status(200).json({ ok: true });
  }
}
