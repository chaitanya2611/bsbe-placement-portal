import type { AccountSummary, Program } from '@bsbe/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminService, type AdminSessionSummary } from './admin.service';
import { RequirePermissions, RequireRecentAuthentication } from './access-control';
import { AuditService } from './audit.service';
import {
  CreateProgramDto,
  CreateUserDto,
  ListQueryDto,
  RevokeSessionDto,
  SetProgramStatusDto,
  UpdateAccountStatusDto,
} from './identity.dto';
import type { AuthenticatedRequest } from './request-context';

@ApiTags('administrator identity')
@ApiCookieAuth('bsbe_session')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('programs')
  @RequirePermissions('program:manage')
  @ApiOperation({ summary: 'List programs' })
  listPrograms(): Promise<Program[]> {
    return this.admin.listPrograms();
  }

  @Post('programs')
  @RequirePermissions('program:manage')
  @ApiOperation({ summary: 'Create a program' })
  createProgram(
    @Body() body: CreateProgramDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Program> {
    return this.admin.createProgram(body, request.authentication!.user, request);
  }

  @Patch('programs/:programId/status')
  @RequirePermissions('program:manage')
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Activate or deactivate a program' })
  setProgramStatus(
    @Param('programId') programId: string,
    @Body() body: SetProgramStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Program> {
    return this.admin.setProgramStatus(programId, body, request.authentication!.user, request);
  }

  @Get('users')
  @RequirePermissions('user:manage')
  @ApiOperation({ summary: 'List student and administrator accounts' })
  listUsers(@Query() query: ListQueryDto): Promise<AccountSummary[]> {
    return this.admin.listUsers(query.limit, query.search);
  }

  @Post('users')
  @RequirePermissions('user:manage')
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Create a pre-authorized account' })
  createUser(
    @Body() body: CreateUserDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AccountSummary> {
    return this.admin.createUser(body, request.authentication!.user, request);
  }

  @Patch('users/:userId/status')
  @RequirePermissions('user:manage')
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Activate or deactivate an account and invalidate its sessions' })
  updateStatus(
    @Param('userId') userId: string,
    @Body() body: UpdateAccountStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AccountSummary> {
    return this.admin.updateAccountStatus(userId, body, request);
  }

  @Get('users/:userId/sessions')
  @RequirePermissions('session:revoke')
  @ApiOperation({ summary: 'List recent sessions for an account' })
  listUserSessions(@Param('userId') userId: string): Promise<AdminSessionSummary[]> {
    return this.admin.listSessionsForUser(userId);
  }

  @Post('sessions/:sessionId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('session:revoke')
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Revoke another session with a mandatory reason' })
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @Body() body: RevokeSessionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.admin.revokeSession(sessionId, body.reason, request);
  }

  @Get('audit-events')
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'List recent append-only identity audit events' })
  async listAuditEvents(@Query() query: ListQueryDto): Promise<
    Array<{
      id: string;
      eventType: string;
      actorRole: string | null;
      targetType: string | null;
      targetId: string | null;
      outcome: string;
      reason: string | null;
      correlationId: string | null;
      occurredAt: string;
      metadata: Record<string, string | number | boolean>;
    }>
  > {
    const events = await this.audit.list(query.limit);
    return events.map((event) => ({
      id: event.publicId,
      eventType: event.eventType,
      actorRole: event.actorRole ?? null,
      targetType: event.targetType ?? null,
      targetId: event.targetPublicId ?? null,
      outcome: event.outcome,
      reason: event.reason ?? null,
      correlationId: event.correlationId ?? null,
      occurredAt: event.occurredAt.toISOString(),
      metadata: event.metadata ?? {},
    }));
  }

  @Get('audit-events.csv')
  @RequirePermissions('audit:read', 'export:manage')
  async exportAuditEvents(
    @Query() query: ListQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const events = await this.audit.list(query.limit);
    await this.audit.record({
      eventType: 'report.audit-exported',
      actorUserId: request.authentication!.user._id,
      actorRole: request.authentication!.user.role,
      targetType: 'audit',
      outcome: 'success',
      request,
      metadata: { format: 'csv', eventCount: events.length },
    });
    const escape = (value: unknown): string => {
      const text =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : '';
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = events.map((event) =>
      [
        event.publicId,
        event.eventType,
        event.actorRole,
        event.targetType,
        event.targetPublicId,
        event.outcome,
        event.reason,
        event.correlationId,
        event.occurredAt.toISOString(),
      ]
        .map(escape)
        .join(','),
    );
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader('content-disposition', 'attachment; filename="audit-events.csv"');
    response.send(
      [
        'Id,Event,Actor role,Target type,Target id,Outcome,Reason,Correlation id,Occurred at',
        ...rows,
      ].join('\r\n'),
    );
  }
}
