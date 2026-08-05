import { parseApiEnvironment, type ApiEnvironment } from '@bsbe/config';
import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { resolve } from 'node:path';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { HealthModule } from './health/health.module';
import { ExamModule } from './exams/exam.module';
import { IdentityModule } from './identity/identity.module';
import { PlatformModule } from './platform/platform.module';
import { QuestionBankModule } from './question-bank/question-bank.module';

const environmentFilePaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../../../.env'),
];

const databaseModules =
  process.env.DATABASE_ENABLED === 'false'
    ? []
    : [
        MongooseModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService<ApiEnvironment, true>) => ({
            uri: config.get('MONGODB_URI', { infer: true }),
            autoIndex: config.get('NODE_ENV', { infer: true }) !== 'production',
            maxPoolSize: 20,
            minPoolSize: 0,
            serverSelectionTimeoutMS: 5_000,
          }),
        }),
        IdentityModule,
        QuestionBankModule,
        ExamModule,
      ];

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: environmentFilePaths,
      isGlobal: true,
      validate: (environment: Record<string, unknown>) => parseApiEnvironment(environment),
    }),
    ...databaseModules,
    HealthModule,
    PlatformModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
