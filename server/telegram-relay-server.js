const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');

const PORT = 8005;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > limit) reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(data || '{}'));
    req.on('error', reject);
  });
}

function forward(pathname, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, data }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Telegram request timeout')));
    req.end(body);
  });
}

async function readVideo(video) {
  const localPath = String(video.file_path || '');
  if (localPath.startsWith('/root/') && fs.existsSync(localPath)) {
    return {
      buffer: fs.readFileSync(localPath),
      filename: path.basename(localPath) || 'video.mp4',
      source: 'local_file',
    };
  }

  const url = String(video.storage_url || video.url || '');
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`no_readable_video_source:${video.asset_type || video.id || 'unknown'}`);
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ContentFactoryTelegramRelay/1.0',
      Accept: 'video/mp4,application/octet-stream,*/*',
    },
  });
  if (!response.ok) throw new Error(`video_download_failed:${response.status}:${url}`);
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    filename: path.basename(new URL(url).pathname) || `${video.asset_type || 'video'}.mp4`,
    source: 'url_download',
  };
}

async function sendVideoViaWorker(payload, video) {
  const file = await readVideo(video);
  const form = new FormData();
  form.append('chat_id', String(payload.chat_id));
  form.append('caption', String(video.caption || '').slice(0, 1000));
  form.append('supports_streaming', 'true');
  form.append('video', new Blob([file.buffer], { type: 'video/mp4' }), file.filename);

  const workerBase = String(payload.worker_base || '').replace(/\/$/, '');
  const response = await fetch(`${workerBase}/bot${payload.token}/sendVideo`, {
    method: 'POST',
    body: form,
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!response.ok || body.ok !== true) {
    throw new Error(`telegram_video_failed:${response.status}:${JSON.stringify(body).slice(0, 500)}`);
  }
  return {
    asset_type: video.asset_type,
    message_id: body.result?.message_id || null,
    file_source: file.source,
    bytes: file.buffer.length,
  };
}

async function sendSummaryViaWorker(payload) {
  if (!payload.summary_text) return null;
  const workerBase = String(payload.worker_base || '').replace(/\/$/, '');
  const response = await fetch(`${workerBase}/bot${payload.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: payload.chat_id,
      text: String(payload.summary_text).slice(0, 3900),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(`telegram_summary_failed:${response.status}:${JSON.stringify(result).slice(0, 500)}`);
  }
  return result.result?.message_id || null;
}

async function sendPackage(req, res) {
  const raw = await readBody(req);
  const payload = JSON.parse(raw);
  if (!payload.token || !payload.chat_id || !payload.worker_base) {
    return send(res, 400, { ok: false, error: 'missing_delivery_config' });
  }
  const videos = Array.isArray(payload.videos) ? payload.videos : [];
  if (!videos.length) return send(res, 400, { ok: false, error: 'no_videos' });

  const sent = [];
  for (const video of videos) {
    sent.push(await sendVideoViaWorker(payload, video));
  }
  const summaryMessageId = await sendSummaryViaWorker(payload);

  return send(res, 200, {
    ok: true,
    package_id: payload.package_id,
    sent_count: sent.length + (summaryMessageId ? 1 : 0),
    videos: sent,
    summary_message_id: summaryMessageId,
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { status: 'ok', port: PORT });
  }

  try {
    if (req.method === 'POST' && req.url === '/send-package') {
      return await sendPackage(req, res);
    }

    if (req.method === 'POST' && req.url.startsWith('/bot')) {
      const body = await readBody(req);
      const tg = await forward(req.url, body);
      res.writeHead(tg.status || 502, { 'Content-Type': 'application/json' });
      return res.end(tg.data || '{}');
    }

    return send(res, 404, { error: 'not_found' });
  } catch (error) {
    return send(res, 502, { ok: false, error: error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Telegram relay running on :${PORT}`));
