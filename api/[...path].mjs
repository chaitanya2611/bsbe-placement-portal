const defaultApiOrigin = 'https://bsbe-placement-api.onrender.com';
const defaultAllowedOrigin = 'https://bsbe-placement-portal.onrender.com';

const hopByHopHeaders = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function forwardedHeaders(request, allowedOrigin) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (hopByHopHeaders.has(name.toLowerCase()) || value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }

  headers.set('accept-encoding', 'identity');
  headers.set('origin', allowedOrigin);
  headers.set('referer', `${allowedOrigin}/`);
  return headers;
}

function copyResponseHeaders(upstream, response) {
  for (const [name, value] of upstream.headers) {
    if (hopByHopHeaders.has(name.toLowerCase()) || name.toLowerCase() === 'set-cookie') continue;
    response.setHeader(name, value);
  }

  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) response.setHeader('set-cookie', cookies);
}

export default async function handler(request, response) {
  const apiOrigin = process.env.API_PROXY_ORIGIN ?? defaultApiOrigin;
  const allowedOrigin = process.env.API_PROXY_ALLOWED_ORIGIN ?? defaultAllowedOrigin;

  try {
    const upstreamUrl = new URL(request.url ?? '/', apiOrigin);
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: forwardedHeaders(request, allowedOrigin),
      body: await readBody(request),
      redirect: 'manual',
    });

    response.statusCode = upstream.status;
    copyResponseHeaders(upstream, response);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.statusCode = 502;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ code: 'API_UNAVAILABLE', message: 'API is unavailable' }));
  }
}

export const config = {
  maxDuration: 60,
};
