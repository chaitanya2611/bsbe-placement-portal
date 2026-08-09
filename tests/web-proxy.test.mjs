import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { port } = address;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('web server proxies API requests through a configured public origin', async (context) => {
  const api = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ path: request.url }));
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  context.after(() => new Promise((resolve) => api.close(resolve)));

  const apiAddress = api.address();
  assert.ok(apiAddress && typeof apiAddress === 'object');
  const webPort = await reservePort();
  const web = spawn(process.execPath, ['apps/web/server.mjs'], {
    env: {
      ...process.env,
      API_INTERNAL_HOSTPORT: '',
      API_PUBLIC_ORIGIN: `http://127.0.0.1:${apiAddress.port}`,
      PORT: String(webPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  context.after(() => web.kill());

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('web server startup timed out')), 5_000);
    web.once('error', reject);
    web.stdout.on('data', (chunk) => {
      if (!String(chunk).includes('listening')) return;
      clearTimeout(timeout);
      resolve();
    });
  });

  const response = await fetch(`http://127.0.0.1:${webPort}/api/v1/proxy-smoke`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { path: '/api/v1/proxy-smoke' });

  const sebResponse = await fetch(`http://127.0.0.1:${webPort}/BSBE-Placement-Portal.seb`);
  assert.equal(sebResponse.status, 200);
  assert.equal(sebResponse.headers.get('content-type'), 'application/octet-stream');
  assert.equal(
    sebResponse.headers.get('content-disposition'),
    'attachment; filename="BSBE-Placement-Portal.seb"',
  );
  assert.equal(sebResponse.headers.get('cache-control'), 'no-store');
  assert.ok((await sebResponse.arrayBuffer()).byteLength > 0);
});
