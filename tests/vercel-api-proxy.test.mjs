import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

import proxyHandler from '../api/[...path].mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

test('Vercel API proxy preserves the path, body, and secure cookies', async (context) => {
  let received;
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      body: Buffer.concat(chunks).toString('utf8'),
      method: request.method,
      origin: request.headers.origin,
      path: request.url,
    };
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('set-cookie', [
      'bsbe_session=session-value; Path=/; HttpOnly; Secure; SameSite=Lax',
      'bsbe_csrf=csrf-value; Path=/; Secure; SameSite=Lax',
    ]);
    response.end(JSON.stringify({ status: 'ok' }));
  });
  const upstreamOrigin = await listen(upstream);
  context.after(() => upstream.close());

  const previousApiOrigin = process.env.API_PROXY_ORIGIN;
  const previousAllowedOrigin = process.env.API_PROXY_ALLOWED_ORIGIN;
  process.env.API_PROXY_ORIGIN = upstreamOrigin;
  process.env.API_PROXY_ALLOWED_ORIGIN = 'https://trusted.example.test';
  context.after(() => {
    if (previousApiOrigin === undefined) delete process.env.API_PROXY_ORIGIN;
    else process.env.API_PROXY_ORIGIN = previousApiOrigin;
    if (previousAllowedOrigin === undefined) delete process.env.API_PROXY_ALLOWED_ORIGIN;
    else process.env.API_PROXY_ALLOWED_ORIGIN = previousAllowedOrigin;
  });

  const proxy = createServer(proxyHandler);
  const proxyOrigin = await listen(proxy);
  context.after(() => proxy.close());

  const result = await fetch(`${proxyOrigin}/api/v1/auth/request-otp?source=test`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://deployment.vercel.app',
    },
    body: JSON.stringify({ email: 'student@iitb.ac.in' }),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 'ok' });
  assert.deepEqual(received, {
    body: JSON.stringify({ email: 'student@iitb.ac.in' }),
    method: 'POST',
    origin: 'https://trusted.example.test',
    path: '/api/v1/auth/request-otp?source=test',
  });
  assert.deepEqual(result.headers.getSetCookie(), [
    'bsbe_session=session-value; Path=/; HttpOnly; Secure; SameSite=Lax',
    'bsbe_csrf=csrf-value; Path=/; Secure; SameSite=Lax',
  ]);
});
