import { type ApiEnvironment } from '@bsbe/config';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { JsonLogger } from './common/json.logger';

export async function createApplication(): Promise<INestApplication> {
  const logger = new JsonLogger(process.env.NODE_ENV ?? 'development');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger,
  });

  app.useLogger(logger);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const config = app.get(ConfigService<ApiEnvironment, true>);
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy) {
    const expressApplication = app.getHttpAdapter().getInstance() as Express;
    expressApplication.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  const allowedOrigins = new Set(config.get('CORS_ALLOWED_ORIGINS', { infer: true }));
  app.enableCors({
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed'));
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  if (config.get('OPENAPI_ENABLED', { infer: true })) {
    const documentConfiguration = new DocumentBuilder()
      .setTitle('BSBE Placement Mock Test Portal API')
      .setDescription('Secure identity and versioned question-bank administration API.')
      .setVersion('0.3.0')
      .addCookieAuth('bsbe_session')
      .build();
    const document = SwaggerModule.createDocument(app, documentConfiguration);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: { persistAuthorization: false },
    });
  }

  await app.init();
  return app;
}
