export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const response = await fetch('https://app.loops.so/api/v1/contacts/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LOOPS_API_KEY}`,
      },
      body: JSON.stringify({
        email,
        source: 'splash-download-gate',
        subscribed: true,
      }),
    });

    if (response.ok || response.status === 409) {
      return res.redirect(302, '/download.html');
    }

    console.error('Loops API error:', response.status, await response.text());
    return res.redirect(302, '/download.html');
  } catch (err) {
    console.error('Loops API request failed:', err);
    return res.redirect(302, '/download.html');
  }
}
