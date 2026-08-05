import type { ExamInput, IntegrityEventInput, SaveAnswerInput } from '@bsbe/contracts';
import { examInputSchema, integrityEventSchema, saveAnswerSchema } from '@bsbe/contracts';
import { Body, Controller, Get, Header, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { RequirePermissions, RequireRecentAuthentication } from '../identity/access-control';
import type { AuthenticatedRequest } from '../identity/request-context';
import { ZodValidationPipe } from '../question-bank/zod-validation.pipe';
import {
  AttemptActionDto,
  ExamAccessDto,
  ExamStatusDto,
  ExtendAttemptDto,
  PublishResultsDto,
  NotificationAnnouncementDto,
  SectionTransitionDto,
  SubmitAttemptDto,
} from './exam.dto';
import { ExamService } from './exam.service';

@ApiTags('exam administration')
@ApiCookieAuth('bsbe_session')
@Controller('admin/exams')
@RequirePermissions('exam:manage')
export class ExamAdminController {
  constructor(private readonly exams: ExamService) {}

  @Get() @ApiOperation({ summary: 'List examination drafts and schedules' }) list(): ReturnType<
    ExamService['listAdmin']
  > {
    return this.exams.listAdmin();
  }
  @Post()
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Create a validated examination draft' })
  create(
    @Body(new ZodValidationPipe(examInputSchema)) input: ExamInput,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['create']> {
    return this.exams.create(input, request.authentication!.user, request);
  }
  @Put(':examId')
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Update a draft examination' })
  update(
    @Param('examId') examId: string,
    @Body(new ZodValidationPipe(examInputSchema)) input: ExamInput,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['update']> {
    return this.exams.update(examId, input, request.authentication!.user, request);
  }
  @Patch(':examId/status')
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Publish, cancel, or archive an examination' })
  status(
    @Param('examId') examId: string,
    @Body() body: ExamStatusDto,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['setStatus']> {
    return this.exams.setStatus(
      examId,
      body.status,
      body.reason,
      request.authentication!.user,
      request,
    );
  }
  @Get(':examId/live')
  @RequirePermissions('attempt:manage')
  @ApiOperation({ summary: 'View live attempt and integrity status' })
  live(@Param('examId') examId: string): ReturnType<ExamService['listLive']> {
    return this.exams.listLive(examId);
  }
  @Post('attempts/:attemptId/resume')
  @RequirePermissions('attempt:manage')
  @RequireRecentAuthentication()
  resume(
    @Param('attemptId') attemptId: string,
    @Body() body: ExtendAttemptDto,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['manageAttempt']> {
    return this.exams.manageAttempt(
      attemptId,
      'resume',
      body.reason,
      body.seconds,
      request.authentication!.user,
      request,
    );
  }
  @Post('attempts/:attemptId/terminate')
  @RequirePermissions('attempt:manage')
  @RequireRecentAuthentication()
  terminate(
    @Param('attemptId') attemptId: string,
    @Body() body: AttemptActionDto,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['manageAttempt']> {
    return this.exams.manageAttempt(
      attemptId,
      'terminate',
      body.reason,
      0,
      request.authentication!.user,
      request,
    );
  }
  @Patch(':examId/results')
  @RequirePermissions('result:manage')
  @RequireRecentAuthentication()
  publishResults(
    @Param('examId') examId: string,
    @Body() body: PublishResultsDto,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['publishResults']> {
    return this.exams.publishResults(
      examId,
      body.published,
      body.reason,
      request.authentication!.user,
      request,
    );
  }
  @Post(':examId/results/re-evaluate')
  @RequirePermissions('result:manage')
  @RequireRecentAuthentication()
  reevaluate(
    @Param('examId') examId: string,
    @Body() body: AttemptActionDto,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['reevaluateResults']> {
    return this.exams.reevaluateResults(examId, body.reason, request.authentication!.user, request);
  }
  @Get(':examId/analytics')
  @RequirePermissions('analytics:read')
  analytics(@Param('examId') examId: string): ReturnType<ExamService['analytics']> {
    return this.exams.analytics(examId);
  }
  @Get(':examId/attendance.csv')
  @RequirePermissions('export:manage')
  @Header('content-type', 'text/csv; charset=utf-8')
  async attendance(
    @Param('examId') examId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('content-disposition', `attachment; filename="attendance-${examId}.csv"`);
    response.send(await this.exams.attendanceCsv(examId, request.authentication!.user, request));
  }
  @Get(':examId/attendance.xlsx')
  @RequirePermissions('export:manage')
  async attendanceXlsx(
    @Param('examId') examId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader(
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('content-disposition', `attachment; filename="attendance-${examId}.xlsx"`);
    response.send(await this.exams.attendanceXlsx(examId, request.authentication!.user, request));
  }
  @Get(':examId/attendance.pdf')
  @RequirePermissions('export:manage')
  async attendancePdf(
    @Param('examId') examId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('content-disposition', `attachment; filename="attendance-${examId}.pdf"`);
    response.send(await this.exams.attendancePdf(examId, request.authentication!.user, request));
  }
  @Post('notifications/announcement')
  @RequireRecentAuthentication()
  announcement(
    @Body() body: NotificationAnnouncementDto,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['announce']> {
    return this.exams.announce(
      body.title,
      body.message,
      body.programIds ?? [],
      request.authentication!.user,
      request,
    );
  }
}

@ApiTags('student examinations')
@ApiCookieAuth('bsbe_session')
@Controller('student')
export class StudentExamController {
  constructor(private readonly exams: ExamService) {}
  @Get('exams') schedule(
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['studentSchedule']> {
    return this.exams.studentSchedule(request.authentication!.user);
  }
  @Post('exams/:examId/authorize')
  authorize(
    @Param('examId') examId: string,
    @Body() body: ExamAccessDto,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['authorize']> {
    return this.exams.authorize(
      examId,
      body.password,
      body.standardBrowserFallback ?? false,
      request.authentication!.user,
      request,
    );
  }
  @Post('exams/:examId/start')
  start(
    @Param('examId') examId: string,
    @Body() body: { authorizationToken: string; idempotencyKey: string },
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['start']> {
    return this.exams.start(
      examId,
      body.authorizationToken,
      body.idempotencyKey,
      request.authentication!.user,
      request.authentication!.session,
      request,
    );
  }
  @Get('attempts/:attemptId') getAttempt(
    @Param('attemptId') attemptId: string,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['getAttempt']> {
    return this.exams.getAttempt(
      attemptId,
      request.authentication!.user,
      request.authentication!.session,
    );
  }
  @Get('attempts/:attemptId/media/:mediaId')
  async media(
    @Param('attemptId') attemptId: string,
    @Param('mediaId') mediaId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.exams.attemptMedia(
      attemptId,
      mediaId,
      request.authentication!.user,
      request.authentication!.session,
    );
    response.set({
      'Content-Type': content.asset.contentType,
      'Content-Length': String(content.body.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(content.body);
  }
  @Get('attempts-active/current')
  activeAttempt(@Req() request: AuthenticatedRequest): ReturnType<ExamService['activeAttempt']> {
    return this.exams.activeAttempt(request.authentication!.user, request.authentication!.session);
  }
  @Put('attempts/:attemptId/answers')
  save(
    @Param('attemptId') attemptId: string,
    @Body(new ZodValidationPipe(z.array(saveAnswerSchema).min(1).max(100)))
    inputs: SaveAnswerInput[],
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['saveAnswers']> {
    return this.exams.saveAnswers(
      attemptId,
      inputs,
      request.authentication!.user,
      request.authentication!.session,
    );
  }
  @Post('attempts/:attemptId/heartbeat') heartbeat(
    @Param('attemptId') attemptId: string,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['heartbeat']> {
    return this.exams.heartbeat(
      attemptId,
      request.authentication!.user,
      request.authentication!.session,
    );
  }
  @Post('attempts/:attemptId/section') transition(
    @Param('attemptId') attemptId: string,
    @Body() body: SectionTransitionDto,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['transition']> {
    return this.exams.transition(
      attemptId,
      body.nextSectionIndex,
      request.authentication!.user,
      request.authentication!.session,
      request,
    );
  }
  @Post('attempts/:attemptId/integrity')
  integrity(
    @Param('attemptId') attemptId: string,
    @Body(new ZodValidationPipe(integrityEventSchema)) event: IntegrityEventInput,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['integrityEvent']> {
    return this.exams.integrityEvent(
      attemptId,
      event,
      request.authentication!.user,
      request.authentication!.session,
      request,
    );
  }
  @Post('attempts/:attemptId/submit') submit(
    @Param('attemptId') attemptId: string,
    @Body() body: SubmitAttemptDto,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['submit']> {
    return this.exams.submit(
      attemptId,
      'student',
      body.idempotencyKey,
      request.authentication!.user,
      request.authentication!.session,
      request,
    );
  }
  @Get('results') results(
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['studentResults']> {
    return this.exams.studentResults(request.authentication!.user);
  }
  @Get('results/:resultId') result(
    @Param('resultId') resultId: string,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['studentResult']> {
    return this.exams.studentResult(resultId, request.authentication!.user);
  }
  @Get('results/:resultId/marksheet.pdf')
  async marksheet(
    @Param('resultId') resultId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('content-disposition', `attachment; filename="marksheet-${resultId}.pdf"`);
    response.send(await this.exams.marksheetPdf(resultId, request.authentication!.user));
  }
  @Get('notifications') notifications(
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['notifications']> {
    return this.exams.notifications(request.authentication!.user);
  }
  @Post('notifications/:notificationId/read')
  readNotification(
    @Param('notificationId') notificationId: string,
    @Req() request: AuthenticatedRequest,
  ): ReturnType<ExamService['readNotification']> {
    return this.exams.readNotification(notificationId, request.authentication!.user);
  }
}
