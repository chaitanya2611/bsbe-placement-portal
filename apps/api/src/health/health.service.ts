import type { ApiEnvironment } from '@bsbe/config';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';
import { HealthResponseDto } from './health.response.dto';

@Injectable()
export class HealthService {
  constructor(
    @Optional() @InjectConnection() private readonly connection: Connection | undefined,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  liveness(correlationId: string): HealthResponseDto {
    return {
      status: 'ok',
      checkedAt: new Date().toISOString(),
      service: 'bsbe-api',
      version: '0.3.0',
      correlationId,
      checks: {
        process: { status: 'ok' },
      },
    };
  }

  readiness(correlationId: string): HealthResponseDto {
    const databaseEnabled = this.config.get('DATABASE_ENABLED', { infer: true });
    const databaseReady =
      databaseEnabled && this.connection?.readyState === ConnectionStates.connected;
    return {
      status: databaseReady ? 'ok' : 'down',
      checkedAt: new Date().toISOString(),
      service: 'bsbe-api',
      version: '0.3.0',
      correlationId,
      checks: {
        configuration: { status: 'ok' },
        database: databaseReady
          ? { status: 'ok' }
          : {
              status: 'down',
              detail: databaseEnabled
                ? 'MongoDB is not connected'
                : 'Database disabled for this process',
            },
      },
    };
  }
}
