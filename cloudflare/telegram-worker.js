addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ ok: true, service: 'telegram-worker' });
  }

  if (!url.pathname.startsWith('/bot')) {
    return json({ ok: false, error: 'not_found' }, 404);
  }

  const match = url.pathname.match(/^\/bot([^/]+)\/([^/]+)$/);
  if (!match) {
    return json({ ok: false, error: 'bad_telegram_path' }, 400);
  }

  const [, token, method] = match;
  const telegramUrl = `https://api.telegram.org/bot${token}/${method}${url.search}`;

  if (request.method !== 'POST') {
    return forward(request, telegramUrl);
  }

  const contentType = request.headers.get('content-type') || '';
  if (method === 'sendVideo' && contentType.includes('application/json')) {
    const payload = await request.json();
    const videoUrl = payload.video_url || payload.video;

    if (typeof videoUrl === 'string' && /^https?:\/\//i.test(videoUrl)) {
      return sendVideoFromUrl(telegramUrl, payload, videoUrl);
    }

    return forwardJson(telegramUrl, payload);
  }

  return forward(request, telegramUrl);
}

async function sendVideoFromUrl(telegramUrl, payload, videoUrl) {
  const videoResponse = await fetch(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 TelegramWorker/1.0',
      Accept: 'video/mp4,application/octet-stream,*/*',
    },
  });

  if (!videoResponse.ok) {
    return json({
      ok: false,
      error: 'video_fetch_failed',
      status: videoResponse.status,
      video_url: videoUrl,
    }, 502);
  }

  const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
  const blob = await videoResponse.blob();
  const form = new FormData();

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'video' || key === 'video_url') continue;
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === 'boolean' ? String(value) : String(value));
  }

  form.append('video', blob, filenameFromUrl(videoUrl, contentType));

  const tg = await fetch(telegramUrl, {
    method: 'POST',
    body: form,
  });

  return new Response(await tg.text(), {
    status: tg.status,
    headers: {
      'Content-Type': tg.headers.get('content-type') || 'application/json',
    },
  });
}

async function forwardJson(telegramUrl, payload) {
  const tg = await fetch(telegramUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return new Response(await tg.text(), {
    status: tg.status,
    headers: {
      'Content-Type': tg.headers.get('content-type') || 'application/json',
    },
  });
}

async function forward(request, telegramUrl) {
  const headers = new Headers(request.headers);
  headers.delete('host');

  const tg = await fetch(telegramUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });

  return new Response(tg.body, {
    status: tg.status,
    headers: {
      'Content-Type': tg.headers.get('content-type') || 'application/json',
    },
  });
}

function filenameFromUrl(videoUrl, contentType) {
  const name = new URL(videoUrl).pathname.split('/').pop() || 'video.mp4';
  if (name.includes('.')) return name;
  if (contentType.includes('mp4')) return `${name}.mp4`;
  return name;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
