import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as createProxyRequest } from 'node:http';
import { request as createSecureProxyRequest } from 'node:https';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const apiPublicOrigin = process.env.API_PUBLIC_ORIGIN
  ? new URL(process.env.API_PUBLIC_ORIGIN).origin
  : '';
const apiInternalHostport = process.env.API_INTERNAL_HOSTPORT?.trim();
const apiUpstreamOrigin = apiInternalHostport ? `http://${apiInternalHostport}` : apiPublicOrigin;

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json'],
]);

const securityHeaders = {
  'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: ${apiPublicOrigin}; connect-src 'self' ${apiPublicOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function proxyToApi(request, response) {
  if (!apiUpstreamOrigin) {
    response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({ code: 'API_UNAVAILABLE', message: 'API proxy is not configured' }),
    );
    return;
  }

  const forwardedHeaders = { ...request.headers };
  delete forwardedHeaders.connection;
  delete forwardedHeaders['keep-alive'];
  delete forwardedHeaders['proxy-authenticate'];
  delete forwardedHeaders['proxy-authorization'];
  delete forwardedHeaders.te;
  delete forwardedHeaders.trailer;
  delete forwardedHeaders['transfer-encoding'];
  delete forwardedHeaders.upgrade;
  const upstreamUrl = new URL(request.url ?? '/', `${apiUpstreamOrigin}/`);
  forwardedHeaders.host = upstreamUrl.host;
  forwardedHeaders['x-forwarded-host'] = request.headers.host ?? '';
  forwardedHeaders['x-forwarded-proto'] = 'https';

  const proxyRequest =
    upstreamUrl.protocol === 'https:' ? createSecureProxyRequest : createProxyRequest;
  const upstream = proxyRequest(
    upstreamUrl,
    { method: request.method, headers: forwardedHeaders },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      delete responseHeaders.connection;
      delete responseHeaders['keep-alive'];
      delete responseHeaders['proxy-authenticate'];
      delete responseHeaders['proxy-authorization'];
      delete responseHeaders.te;
      delete responseHeaders.trailer;
      delete responseHeaders['transfer-encoding'];
      delete responseHeaders.upgrade;
      response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
      upstreamResponse.pipe(response);
    },
  );

  upstream.on('error', () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ code: 'API_UNAVAILABLE', message: 'API is unavailable' }));
  });
  request.pipe(upstream);
}

createServer((request, response) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.setHeader(name, value);
  }

  if (request.url === '/health/live') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok', service: 'bsbe-web' }));
    return;
  }

  const requestPath = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (requestPath === '/api' || requestPath.startsWith('/api/')) {
    proxyToApi(request, response);
    return;
  }

  const normalizedPath = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, normalizedPath);

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(root, 'index.html');
  }

  response.setHeader(
    'Content-Type',
    contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
  );
  response.setHeader(
    'Cache-Control',
    filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
  );
  createReadStream(filePath).pipe(response);
}).listen(port, '0.0.0.0', () => {
  process.stdout.write(`BSBE web server listening on port ${port}\n`);
});
