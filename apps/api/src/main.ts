import type { ApiEnvironment } from '@bsbe/config';
import { ConfigService } from '@nestjs/config';
import 'reflect-metadata';
import { createApplication } from './bootstrap';

async function main(): Promise<void> {
  const app = await createApplication();
  const config = app.get(ConfigService<ApiEnvironment, true>);
  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

void main();
