import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PermissionGuard, RecentAuthenticationGuard, SessionGuard } from './access.guards';
import { AuditService } from './audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { CsrfGuard } from './csrf.guard';
import { CsrfService } from './csrf.service';
import {
  AuditEventSchema,
  IDENTITY_MODELS,
  MigrationSchema,
  OtpChallengeSchema,
  ProgramSchema,
  SessionSchema,
  UserSchema,
} from './identity.models';
import { MigrationService } from './migration.service';
import { OtpMailerService } from './otp-mailer.service';
import { SessionService } from './session.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IDENTITY_MODELS.program, schema: ProgramSchema },
      { name: IDENTITY_MODELS.user, schema: UserSchema },
      { name: IDENTITY_MODELS.otpChallenge, schema: OtpChallengeSchema },
      { name: IDENTITY_MODELS.session, schema: SessionSchema },
      { name: IDENTITY_MODELS.auditEvent, schema: AuditEventSchema },
      { name: IDENTITY_MODELS.migration, schema: MigrationSchema },
    ]),
  ],
  controllers: [AuthController, AdminController],
  providers: [
    AdminService,
    AuditService,
    AuthService,
    BootstrapAdminService,
    CsrfService,
    MigrationService,
    OtpMailerService,
    SessionService,
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: RecentAuthenticationGuard },
  ],
  exports: [
    AuditService,
    BootstrapAdminService,
    MigrationService,
    MongooseModule,
    OtpMailerService,
  ],
})
export class IdentityModule {}
