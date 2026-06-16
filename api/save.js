export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Parse body manually in case Vercel doesn't auto-parse
  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }
  const { password, data } = body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER || 'louiscmd';
  const GITHUB_REPO = process.env.GITHUB_REPO || 'opieka-i-troska';
  const DEPLOY_HOOK = process.env.VERCEL_DEPLOY_HOOK;

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
  }

  try {
    const filePath = 'admin-data.json';
    const apiBase = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

    // Get current file SHA (needed for update)
    let sha = null;
    const getRes = await fetch(apiBase, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (getRes.ok) {
      const getJson = await getRes.json();
      sha = getJson.sha;
    }

    // Encode content as base64
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    // Commit to GitHub
    const body = {
      message: `Admin update: ${new Date().toISOString()}`,
      content,
      ...(sha ? { sha } : {}),
    };

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      return res.status(500).json({ error: 'GitHub commit failed', detail: err });
    }

    // Trigger Vercel redeploy via deploy hook (if configured)
    if (DEPLOY_HOOK) {
      await fetch(DEPLOY_HOOK, { method: 'POST' }).catch(() => {});
    }

    return res.status(200).json({ ok: true, message: 'Zapisano i wdrożono!' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
