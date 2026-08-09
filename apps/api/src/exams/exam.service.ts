import type {
  AdminExamDetail,
  AdminResultSummary,
  AttemptView,
  ExamInput,
  ExamLockdownConfigInput,
  ExamSummary,
  IntegrityEventInput,
  ResultView,
  SaveAnswerInput,
  StudentExam,
} from '@bsbe/contracts';
import type { ApiEnvironment } from '@bsbe/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import ExcelJS from 'exceljs';
import type { Request } from 'express';
import { type Connection, type HydratedDocument, type Model, Types } from 'mongoose';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AuditService } from '../identity/audit.service';
import {
  IDENTITY_MODELS,
  type ProgramRecord,
  type SessionRecord,
  type UserDocument,
  type UserRecord,
} from '../identity/identity.models';
import { OtpMailerService } from '../identity/otp-mailer.service';
import { MediaService } from '../question-bank/media.service';
import {
  QUESTION_MODELS,
  type MediaAssetRecord,
  type QuestionRecord,
  type QuestionRubricRecord,
  type QuestionVersionRecord,
} from '../question-bank/question.models';
import { RubricCryptoService } from '../question-bank/rubric-crypto.service';
import {
  descriptiveStatistics,
  deterministicOrder,
  gradeFor,
  pointBiserial,
  scoreObjective,
} from './exam-domain';
import {
  EXAM_MODELS,
  type AnswerRecord,
  type AttemptDocument,
  type AttemptQuestionInstance,
  type AttemptRecord,
  type ExamDocument,
  type ExamRecord,
  type ExamVersionDocument,
  type ExamVersionRecord,
  type NotificationRecord,
  type ResultDocument,
  type ResultItemRecord,
  type ResultRecord,
} from './exam.models';

const offlineLeaseSeconds = 90;
const evaluationVersion = 'objective-v1';
function printable(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

@Injectable()
export class ExamService implements OnModuleInit, OnModuleDestroy {
  private maintenanceTimer?: NodeJS.Timeout;

  constructor(
    @InjectModel(EXAM_MODELS.exam) private readonly examModel: Model<ExamRecord>,
    @InjectModel(EXAM_MODELS.examVersion)
    private readonly examVersionModel: Model<ExamVersionRecord>,
    @InjectModel(EXAM_MODELS.attempt) private readonly attemptModel: Model<AttemptRecord>,
    @InjectModel(EXAM_MODELS.answer) private readonly answerModel: Model<AnswerRecord>,
    @InjectModel(EXAM_MODELS.result) private readonly resultModel: Model<ResultRecord>,
    @InjectModel(EXAM_MODELS.notification)
    private readonly notificationModel: Model<NotificationRecord>,
    @InjectModel(IDENTITY_MODELS.user) private readonly userModel: Model<UserRecord>,
    @InjectModel(IDENTITY_MODELS.program) private readonly programModel: Model<ProgramRecord>,
    @InjectModel(IDENTITY_MODELS.session) private readonly sessionModel: Model<SessionRecord>,
    @InjectModel(QUESTION_MODELS.question) private readonly questionModel: Model<QuestionRecord>,
    @InjectModel(QUESTION_MODELS.questionVersion)
    private readonly questionVersionModel: Model<QuestionVersionRecord>,
    @InjectModel(QUESTION_MODELS.questionRubric)
    private readonly rubricModel: Model<QuestionRubricRecord>,
    @InjectModel(QUESTION_MODELS.mediaAsset)
    private readonly mediaModel: Model<MediaAssetRecord>,
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly crypto: RubricCryptoService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly mailer: OtpMailerService,
  ) {}

  onModuleInit(): void {
    this.maintenanceTimer = setInterval(() => {
      void this.finalizeExpiredAttempts().catch(() => undefined);
      void this.queueDueReminders().catch(() => undefined);
      void this.deliverNotifications().catch(() => undefined);
    }, 15_000);
    this.maintenanceTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
  }

  async listAdmin(): Promise<ExamSummary[]> {
    return (await this.examModel.find().sort({ startAt: -1 }).exec()).map((exam) =>
      this.summary(exam),
    );
  }

  async adminDetail(publicId: string): Promise<AdminExamDetail> {
    const exam = await this.examModel
      .findOne({ publicId })
      .select('+passwordHash +sebConfigKeys')
      .exec();
    if (!exam) throw this.notFound('Exam');
    const [programs, questions] = await Promise.all([
      this.programModel.find({ _id: { $in: exam.allowedProgramIds } }).exec(),
      this.questionModel
        .find({ _id: { $in: exam.sections.flatMap((section) => section.questionIds) } })
        .exec(),
    ]);
    const programIds = new Map(
      programs.map((program) => [program._id.toString(), program.publicId]),
    );
    const questionIds = new Map(
      questions.map((question) => [question._id.toString(), question.publicId]),
    );
    return {
      ...this.summary(exam),
      instructions: exam.instructions,
      allowedProgramIds: exam.allowedProgramIds
        .map((id) => programIds.get(id.toString()))
        .filter((id): id is string => Boolean(id)),
      allowStandardBrowserFallback: exam.allowStandardBrowserFallback,
      sebConfigKeys: exam.sebConfigKeys,
      showQuestionReview: exam.showQuestionReview,
      showCorrectAnswers: exam.showCorrectAnswers,
      gradeBoundaries: exam.gradeBoundaries,
      sections: exam.sections.map((section) => ({
        id: section.publicId,
        title: section.title,
        instructions: section.instructions,
        durationSeconds: section.durationSeconds,
        questionIds: section.questionIds
          .map((id) => questionIds.get(id.toString()))
          .filter((id): id is string => Boolean(id)),
        selectCount: section.selectCount,
        randomQuestionOrder: section.randomQuestionOrder,
        randomOptionOrder: section.randomOptionOrder,
        navigation: section.navigation,
      })),
      hasPassword: Boolean(exam.passwordHash),
    };
  }

  async create(input: ExamInput, actor: UserDocument, request: Request): Promise<ExamSummary> {
    const resolved = await this.resolveInput(input, true);
    const exam = await this.examModel.create({
      publicId: randomUUID(),
      ...resolved,
      status: 'draft',
      currentVersion: 1,
      createdBy: actor._id,
      updatedBy: actor._id,
    });
    await this.audit.record({
      eventType: 'exam.created',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'exam',
      targetPublicId: exam.publicId,
      outcome: 'success',
      request,
    });
    return this.summary(exam);
  }

  async update(
    publicId: string,
    input: ExamInput,
    actor: UserDocument,
    request: Request,
  ): Promise<ExamSummary> {
    const exam = await this.examModel
      .findOne({ publicId })
      .select('+passwordHash +sebConfigKeys')
      .exec();
    if (!exam) throw this.notFound('Exam');
    const updatingPublished = exam.status === 'published';
    if (updatingPublished && exam.startAt.getTime() <= Date.now())
      throw new ConflictException({
        code: 'EXAM_ENTRY_STARTED',
        message: 'This published exam can no longer be edited because its entry time has started',
      });
    if (exam.status !== 'draft' && !updatingPublished)
      throw new ConflictException({
        code: 'EXAM_IMMUTABLE',
        message: 'Only draft or not-yet-started published exams can be edited',
      });
    const resolved = await this.resolveInput(input, false);
    if (updatingPublished && resolved.startAt.getTime() <= Date.now())
      throw new ConflictException({
        code: 'EXAM_ENTRY_STARTED',
        message: 'A published exam must retain a future entry start time when it is edited',
      });
    Object.assign(exam, resolved, {
      passwordHash: input.password ? this.hashPassword(input.password) : exam.passwordHash,
      currentVersion: exam.currentVersion + 1,
      updatedBy: actor._id,
    });
    exam.set('sebConfigurationUrl', input.sebConfigurationUrl || undefined);
    if (updatingPublished) {
      await this.persistPublishedVersion(exam, actor, request, 'exam.modified');
      await this.queueExamNotifications(
        exam,
        'schedule-change',
        'Examination schedule updated',
        `${exam.name} has been updated and is scheduled for ${exam.startAt.toISOString()}.`,
        'published-edit',
      );
    } else {
      await exam.save();
      await this.audit.record({
        eventType: 'exam.modified',
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'exam',
        targetPublicId: publicId,
        outcome: 'success',
        request,
      });
    }
    return this.summary(exam);
  }

  async setStatus(
    publicId: string,
    status: 'published' | 'cancelled' | 'archived',
    reason: string,
    actor: UserDocument,
    request: Request,
  ): Promise<ExamSummary> {
    const exam = await this.examModel
      .findOne({ publicId })
      .select('+passwordHash +sebConfigKeys')
      .exec();
    if (!exam) throw this.notFound('Exam');
    if (status === 'published') await this.publish(exam, actor, request);
    else {
      if (status === 'cancelled' && exam.status !== 'published')
        throw new ConflictException({
          code: 'EXAM_STATE_INVALID',
          message: 'Only a published exam can be cancelled',
        });
      exam.status = status;
      if (status === 'cancelled') exam.cancelledAt = new Date();
      exam.updatedBy = actor._id;
      await exam.save();
      await this.audit.record({
        eventType: `exam.${status}`,
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'exam',
        targetPublicId: publicId,
        outcome: 'success',
        reason,
        request,
      });
      if (status === 'cancelled')
        await this.queueExamNotifications(
          exam,
          'exam-cancelled',
          'Examination cancelled',
          `${exam.name} has been cancelled.`,
        );
    }
    return this.summary(exam);
  }

  async updateLockdownConfig(
    publicId: string,
    input: ExamLockdownConfigInput,
    actor: UserDocument,
    request: Request,
  ): Promise<ExamSummary> {
    const exam = await this.examModel.findOne({ publicId }).select('+sebConfigKeys').exec();
    if (!exam) throw this.notFound('Exam');
    if (!exam.lockdownRequired)
      throw new ConflictException({
        code: 'EXAM_LOCKDOWN_DISABLED',
        message: 'Safe Exam Browser is not enabled for this examination',
      });
    exam.sebConfigKeys = input.sebConfigKeys.map((key) => key.toLowerCase());
    exam.sebConfigurationUrl = input.sebConfigurationUrl;
    exam.updatedBy = actor._id;
    await exam.save();
    await this.audit.record({
      eventType: 'exam.lockdown-config.updated',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'exam',
      targetPublicId: publicId,
      outcome: 'success',
      reason: 'Administrator replaced the approved SEB configuration URL and key allowlist',
      request,
    });
    return this.summary(exam);
  }

  async studentSchedule(user: UserDocument): Promise<StudentExam[]> {
    const query = user.programId
      ? { status: 'published', allowedProgramIds: user.programId }
      : { status: 'published', _id: null };
    const exams = await this.examModel.find(query).sort({ startAt: 1 }).exec();
    const attempts = await this.attemptModel
      .find({ userId: user._id, examId: { $in: exams.map((exam) => exam._id) } })
      .exec();
    const results = await this.resultModel.find({ userId: user._id, published: true }).exec();
    return exams.map((exam) => ({
      ...this.summary(exam),
      instructions: exam.instructions,
      eligible: true,
      attemptStatus: attempts.find((attempt) => attempt.examId.equals(exam._id))?.status ?? null,
      resultPublished: results.some((result) => result.examId.equals(exam._id)),
    }));
  }

  async authorize(
    publicId: string,
    password: string,
    standardFallback: boolean,
    user: UserDocument,
    request: Request,
  ): Promise<{ authorizationToken: string; expiresInSeconds: number }> {
    const exam = await this.examModel
      .findOne({ publicId, status: 'published' })
      .select('+passwordHash +sebConfigKeys')
      .exec();
    if (!exam || !user.programId || !exam.allowedProgramIds.some((id) => id.equals(user.programId)))
      throw new ForbiddenException({ code: 'EXAM_ACCESS_DENIED', message: 'Exam access denied' });
    const now = new Date();
    if (now < exam.startAt || now > exam.endEntryAt)
      throw new ForbiddenException({
        code: 'EXAM_ENTRY_CLOSED',
        message: 'The exam entry window is closed',
      });
    if (!exam.passwordHash || !this.verifyPassword(password, exam.passwordHash))
      throw new ForbiddenException({ code: 'EXAM_ACCESS_DENIED', message: 'Exam access denied' });
    if (exam.lockdownRequired && !this.validSebRequest(exam, request)) {
      if (!(standardFallback && exam.allowStandardBrowserFallback)) {
        await this.audit.record({
          eventType: 'lockdown.verification-failed',
          actorUserId: user._id,
          actorRole: user.role,
          targetType: 'exam',
          targetPublicId: publicId,
          outcome: 'rejected',
          request,
        });
        throw new ForbiddenException({
          code: 'LOCKDOWN_REQUIRED',
          message: 'This exam requires an approved Safe Exam Browser configuration',
        });
      }
      await this.audit.record({
        eventType: 'lockdown.standard-browser-fallback',
        actorUserId: user._id,
        actorRole: user.role,
        targetType: 'exam',
        targetPublicId: publicId,
        outcome: 'success',
        request,
      });
    }
    const expires = Math.floor(Date.now() / 1000) + 300;
    return {
      authorizationToken: this.accessToken(exam.publicId, user.publicId, expires),
      expiresInSeconds: 300,
    };
  }

  async start(
    examPublicId: string,
    token: string,
    idempotencyKey: string,
    user: UserDocument,
    session: HydratedSession,
    request: Request,
  ): Promise<AttemptView> {
    const existing = await this.attemptModel
      .findOne({ userId: user._id })
      .sort({ createdAt: -1 })
      .exec();
    if (existing?.status === 'in-progress') {
      const existingVersion = await this.examVersionModel.findById(existing.examVersionId).exec();
      if (existingVersion?.examPublicId === examPublicId)
        return this.view(existing, existingVersion);
      if (existingVersion)
        throw new ConflictException({
          code: 'ACTIVE_ATTEMPT_EXISTS',
          message: 'Finish or resolve the current examination before starting another one',
        });
    }
    const exam = await this.examModel
      .findOne({ publicId: examPublicId, status: 'published' })
      .exec();
    if (!exam?.publishedVersionId || !this.verifyAccessToken(token, examPublicId, user.publicId))
      throw new ForbiddenException({
        code: 'EXAM_AUTHORIZATION_INVALID',
        message: 'Exam authorization is invalid or expired',
      });
    const version = await this.examVersionModel.findById(exam.publishedVersionId).exec();
    if (!version) throw this.notFound('Published exam version');
    const now = new Date();
    if (now < version.startAt || now > version.endEntryAt)
      throw new ForbiddenException({
        code: 'EXAM_ENTRY_CLOSED',
        message: 'The exam entry window is closed',
      });
    const seed = randomBytes(32).toString('hex');
    const instances = await this.buildInstances(version, seed);
    const endsAt = new Date(
      Math.min(
        now.getTime() + version.durationSeconds * 1000,
        version.endEntryAt.getTime() + version.durationSeconds * 1000,
      ),
    );
    const sectionEndsAt = new Date(
      Math.min(endsAt.getTime(), now.getTime() + version.sections[0]!.durationSeconds * 1000),
    );
    let attempt: AttemptDocument;
    try {
      attempt = await this.attemptModel.create({
        publicId: randomUUID(),
        startIdempotencyKey: idempotencyKey,
        examId: exam._id,
        examVersionId: version._id,
        userId: user._id,
        sessionId: session._id,
        deviceSessionId: session.deviceSessionId,
        status: 'in-progress',
        randomSeed: seed,
        questionInstances: instances,
        startedAt: now,
        endsAt,
        currentSectionIndex: 0,
        sectionStartedAt: now,
        sectionEndsAt,
        lastHeartbeatAt: now,
        offlineLeaseExpiresAt: this.lease(now, endsAt),
        revision: 0,
        extensionSeconds: 0,
        suspiciousEventCount: 0,
      });
    } catch (error) {
      if (this.duplicate(error)) {
        const raced = await this.attemptModel
          .findOne({ examId: exam._id, userId: user._id })
          .exec();
        if (raced) return this.view(raced, version);
      }
      throw error;
    }
    await this.sessionModel.updateOne(
      { _id: session._id, active: true },
      { $set: { activeAttemptId: attempt._id } },
    );
    await this.audit.record({
      eventType: 'attempt.started',
      actorUserId: user._id,
      actorRole: user.role,
      targetType: 'attempt',
      targetPublicId: attempt.publicId,
      outcome: 'success',
      request,
    });
    return this.view(attempt, version);
  }

  async getAttempt(
    publicId: string,
    user: UserDocument,
    session: HydratedSession,
  ): Promise<AttemptView> {
    const attempt = await this.ownedAttempt(publicId, user, session);
    const version = await this.examVersionModel.findById(attempt.examVersionId).exec();
    if (!version) throw this.notFound('Exam version');
    await this.enforceTime(attempt, version);
    return this.view(attempt, version);
  }

  async attemptMedia(
    attemptPublicId: string,
    mediaPublicId: string,
    user: UserDocument,
    session: HydratedSession,
  ): Promise<{ asset: MediaAssetRecord; body: Buffer }> {
    const attempt = await this.ownedAttempt(attemptPublicId, user, session);
    const asset = await this.mediaModel
      .findOne({ publicId: mediaPublicId, status: 'ready' })
      .exec();
    if (!asset) throw this.notFound('Media');
    const versions = await this.questionVersionModel
      .find({ _id: { $in: attempt.questionInstances.map((item) => item.questionVersionId) } })
      .exec();
    const referenced = versions.some(
      (version) =>
        version.mediaIds.some((id) => id.equals(asset._id)) ||
        version.options.some((option) => option.mediaId?.equals(asset._id)),
    );
    if (!referenced) throw this.notFound('Media');
    return this.media.content(mediaPublicId);
  }

  async activeAttempt(user: UserDocument, session: HydratedSession): Promise<AttemptView | null> {
    const attempt = await this.attemptModel
      .findOne({ userId: user._id, status: { $in: ['in-progress', 'interrupted'] } })
      .sort({ createdAt: -1 })
      .exec();
    if (!attempt || attempt.deviceSessionId !== session.deviceSessionId) return null;
    const version = await this.examVersionModel.findById(attempt.examVersionId).exec();
    if (!version) return null;
    await this.enforceTime(attempt, version);
    return ['in-progress', 'interrupted'].includes(attempt.status)
      ? this.view(attempt, version)
      : null;
  }

  async saveAnswers(
    publicId: string,
    inputs: SaveAnswerInput[],
    user: UserDocument,
    session: HydratedSession,
  ): Promise<{
    revision: number;
    saved: Array<{ questionInstanceId: string; sequence: number; serverReceivedAt: string }>;
  }> {
    const attempt = await this.ownedAttempt(publicId, user, session);
    const version = await this.examVersionModel.findById(attempt.examVersionId).exec();
    if (!version) throw this.notFound('Exam version');
    await this.enforceTime(attempt, version);
    const now = new Date();
    if (attempt.status !== 'in-progress' || now > attempt.offlineLeaseExpiresAt)
      throw new ConflictException({
        code: 'OFFLINE_LEASE_EXPIRED',
        message: 'Answer saving is paused; contact an administrator to resume the attempt',
      });
    const saved: Array<{ questionInstanceId: string; sequence: number; serverReceivedAt: string }> =
      [];
    for (const input of inputs) {
      const instance = attempt.questionInstances.find(
        (candidate) => candidate.publicId === input.questionInstanceId,
      );
      if (!instance)
        throw new BadRequestException({
          code: 'QUESTION_INSTANCE_INVALID',
          message: 'Question instance does not belong to this attempt',
        });
      const existing = await this.answerModel
        .findOne({ attemptId: attempt._id, questionInstanceId: input.questionInstanceId })
        .exec();
      if (existing && input.sequence <= existing.sequence) {
        saved.push({
          questionInstanceId: input.questionInstanceId,
          sequence: existing.sequence,
          serverReceivedAt: existing.serverReceivedAt.toISOString(),
        });
        continue;
      }
      await this.answerModel.findOneAndUpdate(
        {
          attemptId: attempt._id,
          questionInstanceId: input.questionInstanceId,
          ...(existing ? { sequence: existing.sequence } : {}),
        },
        {
          $set: {
            sequence: input.sequence,
            answer: input.answer,
            markedForReview: input.markedForReview,
            clientEventAt: new Date(input.clientEventAt),
            serverReceivedAt: now,
            attemptRevision: attempt.revision,
            deviceSessionId: session.deviceSessionId,
          },
        },
        { upsert: !existing, new: true, runValidators: true },
      );
      saved.push({
        questionInstanceId: input.questionInstanceId,
        sequence: input.sequence,
        serverReceivedAt: now.toISOString(),
      });
    }
    attempt.revision += 1;
    attempt.lastHeartbeatAt = now;
    attempt.offlineLeaseExpiresAt = this.lease(now, attempt.endsAt);
    await attempt.save();
    return { revision: attempt.revision, saved };
  }

  async heartbeat(
    publicId: string,
    user: UserDocument,
    session: HydratedSession,
  ): Promise<{
    serverTime: string;
    endsAt: string;
    sectionEndsAt: string;
    offlineLeaseExpiresAt: string;
    status: string;
  }> {
    const attempt = await this.ownedAttempt(publicId, user, session);
    const version = await this.examVersionModel.findById(attempt.examVersionId).exec();
    if (!version) throw this.notFound('Exam version');
    await this.enforceTime(attempt, version);
    const now = new Date();
    if (attempt.status === 'interrupted' && now <= attempt.endsAt) {
      attempt.status = 'in-progress';
      attempt.resumedAt = now;
    }
    attempt.lastHeartbeatAt = now;
    attempt.offlineLeaseExpiresAt = this.lease(now, attempt.endsAt);
    await attempt.save();
    return {
      serverTime: now.toISOString(),
      endsAt: attempt.endsAt.toISOString(),
      sectionEndsAt: attempt.sectionEndsAt.toISOString(),
      offlineLeaseExpiresAt: attempt.offlineLeaseExpiresAt.toISOString(),
      status: attempt.status,
    };
  }

  async transition(
    publicId: string,
    nextSectionIndex: number,
    user: UserDocument,
    session: HydratedSession,
    request: Request,
  ): Promise<AttemptView> {
    const attempt = await this.ownedAttempt(publicId, user, session);
    const version = await this.examVersionModel.findById(attempt.examVersionId).exec();
    if (!version) throw this.notFound('Exam version');
    if (
      nextSectionIndex !== attempt.currentSectionIndex + 1 ||
      nextSectionIndex >= version.sections.length
    )
      throw new BadRequestException({
        code: 'SECTION_TRANSITION_INVALID',
        message: 'Only the next section can be opened',
      });
    const now = new Date();
    attempt.currentSectionIndex = nextSectionIndex;
    attempt.sectionStartedAt = now;
    attempt.sectionEndsAt = new Date(
      Math.min(
        attempt.endsAt.getTime(),
        now.getTime() + version.sections[nextSectionIndex]!.durationSeconds * 1000,
      ),
    );
    attempt.revision += 1;
    await attempt.save();
    await this.audit.record({
      eventType: 'attempt.section-transition',
      actorUserId: user._id,
      actorRole: user.role,
      targetType: 'attempt',
      targetPublicId: publicId,
      outcome: 'success',
      request,
      metadata: { sectionIndex: nextSectionIndex },
    });
    return this.view(attempt, version);
  }

  async integrityEvent(
    publicId: string,
    event: IntegrityEventInput,
    user: UserDocument,
    session: HydratedSession,
    request: Request,
  ): Promise<void> {
    const attempt = await this.ownedAttempt(publicId, user, session);
    attempt.suspiciousEventCount += 1;
    if (event.type === 'offline') attempt.status = 'interrupted';
    if (event.type === 'reconnected' && attempt.status === 'interrupted') {
      attempt.status = 'in-progress';
      attempt.resumedAt = new Date();
    }
    await attempt.save();
    await this.audit.record({
      eventType: `integrity.${event.type}`,
      actorUserId: user._id,
      actorRole: user.role,
      targetType: 'attempt',
      targetPublicId: publicId,
      outcome: 'success',
      request,
      metadata: { occurredAt: event.occurredAt },
    });
  }

  async submit(
    publicId: string,
    reason: 'student' | 'expired' | 'terminated',
    idempotencyKey: string | null,
    user: UserDocument | null,
    session: HydratedSession | null,
    request?: Request,
  ): Promise<{ resultId: string; status: string }> {
    const query: Record<string, unknown> = { publicId };
    if (user) query.userId = user._id;
    if (session) query.deviceSessionId = session.deviceSessionId;
    const attempt = await this.attemptModel.findOne(query).exec();
    if (!attempt) throw this.notFound('Attempt');
    const existing = await this.resultModel
      .findOne({ attemptId: attempt._id })
      .sort({ version: -1 })
      .exec();
    if (existing && !['in-progress', 'interrupted'].includes(attempt.status))
      return { resultId: existing.publicId, status: attempt.status };
    const version = await this.examVersionModel.findById(attempt.examVersionId).exec();
    if (!version) throw this.notFound('Exam version');
    const status =
      reason === 'student' ? 'submitted' : reason === 'expired' ? 'auto-submitted' : 'terminated';
    const claimed = await this.attemptModel
      .findOneAndUpdate(
        { _id: attempt._id, status: { $in: ['in-progress', 'interrupted'] } },
        {
          $set: {
            status,
            submittedAt: new Date(),
            submissionReason: reason,
            ...(idempotencyKey ? { submissionIdempotencyKey: idempotencyKey } : {}),
          },
        },
        { new: true },
      )
      .exec();
    if (!claimed) {
      const raced = await this.resultModel
        .findOne({ attemptId: attempt._id })
        .sort({ version: -1 })
        .exec();
      if (raced) return { resultId: raced.publicId, status: attempt.status };
      throw new ConflictException({
        code: 'SUBMISSION_IN_PROGRESS',
        message: 'Submission is already being processed',
      });
    }
    const result = await this.evaluate(claimed, version, 1);
    await this.sessionModel.updateMany(
      { activeAttemptId: claimed._id },
      { $unset: { activeAttemptId: 1 } },
    );
    await this.audit.record({
      eventType: reason === 'student' ? 'attempt.submitted' : `attempt.${status}`,
      actorUserId: user?._id,
      actorRole: user?.role ?? 'system',
      targetType: 'attempt',
      targetPublicId: publicId,
      outcome: 'success',
      request,
    });
    return { resultId: result.publicId, status };
  }

  async listLive(examPublicId: string): Promise<unknown[]> {
    const exam = await this.examModel.findOne({ publicId: examPublicId }).exec();
    if (!exam) throw this.notFound('Exam');
    const attempts = await this.attemptModel
      .find({ examId: exam._id })
      .sort({ updatedAt: -1 })
      .exec();
    const users = await this.userModel
      .find({ role: 'student', status: 'active', programId: { $in: exam.allowedProgramIds } })
      .exec();
    const now = new Date();
    return users.map((user) => {
      const attempt = attempts.find((candidate) => candidate.userId.equals(user._id));
      if (!attempt)
        return {
          id: null,
          studentName: user.fullName,
          rollNumber: user.rollNumber ?? '',
          status: now > exam.endEntryAt ? 'absent' : 'not-started',
          startedAt: null,
          lastHeartbeatAt: null,
          suspiciousEvents: 0,
        };
      return {
        id: attempt.publicId,
        studentName: user?.fullName ?? 'Unknown',
        rollNumber: user?.rollNumber ?? '',
        status: attempt.status,
        startedAt: attempt.startedAt.toISOString(),
        lastHeartbeatAt: attempt.lastHeartbeatAt.toISOString(),
        suspiciousEvents: attempt.suspiciousEventCount,
      };
    });
  }

  async manageAttempt(
    publicId: string,
    action: 'resume' | 'terminate',
    reason: string,
    seconds: number,
    actor: UserDocument,
    request: Request,
  ): Promise<void> {
    const attempt = await this.attemptModel.findOne({ publicId }).exec();
    if (!attempt) throw this.notFound('Attempt');
    if (action === 'terminate') {
      await this.submit(publicId, 'terminated', null, null, null, request);
      return;
    }
    const now = new Date();
    attempt.status = 'in-progress';
    attempt.resumedAt = now;
    attempt.extensionSeconds += seconds;
    attempt.endsAt = new Date(attempt.endsAt.getTime() + seconds * 1000);
    attempt.sectionEndsAt = new Date(attempt.sectionEndsAt.getTime() + seconds * 1000);
    attempt.offlineLeaseExpiresAt = this.lease(now, attempt.endsAt);
    await attempt.save();
    await this.audit.record({
      eventType: 'attempt.admin-resumed',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'attempt',
      targetPublicId: publicId,
      outcome: 'success',
      reason,
      request,
      metadata: { extensionSeconds: seconds },
    });
  }

  async publishResults(
    examPublicId: string,
    published: boolean,
    reason: string,
    actor: UserDocument,
    request: Request,
  ): Promise<{ updated: number }> {
    const exam = await this.examModel.findOne({ publicId: examPublicId }).exec();
    if (!exam) throw this.notFound('Exam');
    const now = new Date();
    const outcome = await this.resultModel.updateMany(
      { examId: exam._id },
      {
        $set: { published, ...(published ? { publishedAt: now } : {}) },
        ...(published ? {} : { $unset: { publishedAt: 1 } }),
      },
    );
    await this.audit.record({
      eventType: published ? 'result.published' : 'result.unpublished',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'exam',
      targetPublicId: examPublicId,
      outcome: 'success',
      reason,
      request,
      metadata: { resultCount: outcome.modifiedCount },
    });
    if (published) await this.queueResultNotifications(exam);
    return { updated: outcome.modifiedCount };
  }

  async reevaluateResults(
    examPublicId: string,
    reason: string,
    actor: UserDocument,
    request: Request,
  ): Promise<{ created: number }> {
    const exam = await this.examModel.findOne({ publicId: examPublicId }).exec();
    if (!exam) throw this.notFound('Exam');
    const attempts = await this.attemptModel
      .find({ examId: exam._id, status: { $in: ['submitted', 'auto-submitted', 'terminated'] } })
      .exec();
    let created = 0;
    for (const attempt of attempts) {
      const version = await this.examVersionModel.findById(attempt.examVersionId).exec();
      if (!version) continue;
      const latest = await this.resultModel
        .findOne({ attemptId: attempt._id })
        .sort({ version: -1 })
        .exec();
      await this.evaluate(attempt, version, (latest?.version ?? 0) + 1);
      created += 1;
    }
    await this.audit.record({
      eventType: 'result.reevaluated',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'exam',
      targetPublicId: examPublicId,
      outcome: 'success',
      reason,
      request,
      metadata: { resultCount: created, evaluationVersion },
    });
    return { created };
  }

  async studentResult(resultPublicId: string, user: UserDocument): Promise<ResultView> {
    const result = await this.resultModel
      .findOne({ publicId: resultPublicId, userId: user._id, published: true })
      .exec();
    if (!result) throw this.notFound('Published result');
    return this.resultView(result, user);
  }

  async studentResults(user: UserDocument): Promise<ResultView[]> {
    const results = await this.resultModel
      .find({ userId: user._id, published: true })
      .sort({ publishedAt: -1 })
      .exec();
    return Promise.all(results.map((result) => this.resultView(result, user)));
  }

  async adminResults(examPublicId: string): Promise<AdminResultSummary[]> {
    const exam = await this.examModel.findOne({ publicId: examPublicId }).exec();
    if (!exam) throw this.notFound('Exam');
    const resultHistory = await this.resultModel
      .find({ examId: exam._id })
      .sort({ version: -1, evaluatedAt: -1 })
      .exec();
    const latestByAttempt = new Map<string, ResultDocument>();
    for (const result of resultHistory) {
      const attemptId = result.attemptId.toString();
      if (!latestByAttempt.has(attemptId)) latestByAttempt.set(attemptId, result);
    }
    const results = [...latestByAttempt.values()];
    if (!results.length) return [];

    const [users, attempts] = await Promise.all([
      this.userModel.find({ _id: { $in: results.map((result) => result.userId) } }).exec(),
      this.attemptModel.find({ _id: { $in: results.map((result) => result.attemptId) } }).exec(),
    ]);
    const programs = await this.programModel
      .find({
        _id: {
          $in: users.flatMap((user) => (user.programId ? [user.programId] : [])),
        },
      })
      .exec();
    const userById = new Map(users.map((user) => [user.id, user]));
    const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
    const programById = new Map(programs.map((program) => [program.id, program]));

    return results.flatMap((result) => {
      const user = userById.get(result.userId.toString());
      const attempt = attemptById.get(result.attemptId.toString());
      if (!user || !attempt) return [];
      const program = user.programId ? programById.get(user.programId.toString()) : undefined;
      return [
        {
          id: result.publicId,
          examId: exam.publicId,
          studentName: user.fullName,
          candidateEmail: user.email,
          rollNumber: user.rollNumber ?? '',
          program: program?.name ?? '',
          attendance:
            attempt.status === 'submitted'
              ? 'submitted'
              : attempt.status === 'auto-submitted'
                ? 'auto-submitted'
                : attempt.status === 'terminated'
                  ? 'terminated'
                  : 'interrupted',
          startedAt: attempt.startedAt.toISOString(),
          submittedAt: (attempt.submittedAt ?? attempt.updatedAt).toISOString(),
          score: result.score,
          maximumScore: result.maximumScore,
          percentage: result.percentage,
          grade: result.grade,
          published: result.published,
          publishedAt: result.publishedAt?.toISOString() ?? null,
          evaluatedAt: result.evaluatedAt.toISOString(),
          sectionScores: result.sectionScores,
        },
      ];
    });
  }

  async analytics(examPublicId: string): Promise<unknown> {
    const exam = await this.examModel.findOne({ publicId: examPublicId }).exec();
    if (!exam) throw this.notFound('Exam');
    const results = await this.resultModel.find({ examId: exam._id }).exec();
    const totals = results.map((result) => result.score);
    const statistics = descriptiveStatistics(totals);
    const grades = Object.fromEntries(
      [...new Set(results.map((result) => result.grade))].map((grade) => [
        grade,
        results.filter((result) => result.grade === grade).length,
      ]),
    );
    const questionVersionIds = [
      ...new Set(results.flatMap((result) => result.items.map((item) => item.questionVersionId))),
    ];
    const questions = questionVersionIds.map((questionVersionId) => {
      const pairs = results
        .map((result) => ({
          item: result.items.find((item) => item.questionVersionId === questionVersionId),
          total: result.score,
        }))
        .filter((pair): pair is { item: ResultItemRecord; total: number } => Boolean(pair.item));
      const items = pairs.map((pair) => pair.item);
      const correct = items.map((item) => item.correct);
      return {
        questionVersionId,
        sampleSize: items.length,
        facilityIndex: items.length ? correct.filter(Boolean).length / items.length : null,
        correctedPointBiserial: pointBiserial(
          correct,
          pairs.map((pair) => pair.total),
        ),
      };
    });
    return {
      exam: this.summary(exam),
      statistics,
      gradeDistribution: grades,
      questions,
      metricNotice:
        results.length < 10 ? 'Item discrimination is hidden for sample sizes below 10.' : null,
    };
  }

  async attendanceCsv(
    examPublicId: string,
    actor: UserDocument,
    request: Request,
  ): Promise<string> {
    const rows = (await this.listLive(examPublicId)) as Array<Record<string, unknown>>;
    await this.audit.record({
      eventType: 'report.attendance-exported',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'exam',
      targetPublicId: examPublicId,
      outcome: 'success',
      request,
      metadata: { format: 'csv' },
    });
    const escape = (value: unknown): string => `"${printable(value).replaceAll('"', '""')}"`;
    return [
      'Student,Roll number,Status,Started at,Last heartbeat,Suspicious events',
      ...rows.map((row) =>
        [
          row.studentName,
          row.rollNumber,
          row.status,
          row.startedAt,
          row.lastHeartbeatAt,
          row.suspiciousEvents,
        ]
          .map(escape)
          .join(','),
      ),
    ].join('\r\n');
  }

  async attendanceXlsx(
    examPublicId: string,
    actor: UserDocument,
    request: Request,
  ): Promise<Buffer> {
    const rows = (await this.listLive(examPublicId)) as Array<Record<string, unknown>>;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BSBE Placement Mock Test Portal';
    const sheet = workbook.addWorksheet('Attendance');
    sheet.columns = [
      { header: 'Student', key: 'studentName', width: 28 },
      { header: 'Roll number', key: 'rollNumber', width: 18 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Started at', key: 'startedAt', width: 28 },
      { header: 'Last heartbeat', key: 'lastHeartbeatAt', width: 28 },
      { header: 'Suspicious events', key: 'suspiciousEvents', width: 20 },
    ];
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = 'A1:F1';
    await this.recordExport(examPublicId, actor, request, 'xlsx');
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async attendancePdf(
    examPublicId: string,
    actor: UserDocument,
    request: Request,
  ): Promise<Buffer> {
    const rows = (await this.listLive(examPublicId)) as Array<Record<string, unknown>>;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([842, 595]);
    let y = 555;
    page.drawText('BSBE Department - Examination Attendance', {
      x: 36,
      y,
      size: 16,
      font: bold,
      color: rgb(0.08, 0.2, 0.32),
    });
    y -= 28;
    for (const row of rows) {
      if (y < 45) {
        page = pdf.addPage([842, 595]);
        y = 555;
      }
      const line = `${printable(row.rollNumber).padEnd(14)} ${printable(row.studentName)
        .slice(0, 34)
        .padEnd(35)} ${printable(row.status).padEnd(16)} ${printable(row.startedAt)}`;
      page.drawText(line, { x: 36, y, size: 9, font });
      y -= 16;
    }
    page.drawText(`Generated ${new Date().toISOString()}`, { x: 36, y: 20, size: 8, font });
    await this.recordExport(examPublicId, actor, request, 'pdf');
    return Buffer.from(await pdf.save());
  }

  async marksheetPdf(resultPublicId: string, user: UserDocument): Promise<Buffer> {
    const result = await this.studentResult(resultPublicId, user);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawRectangle({
      x: 35,
      y: 55,
      width: 525,
      height: 730,
      borderWidth: 1.5,
      borderColor: rgb(0.08, 0.2, 0.32),
    });
    page.drawText('BSBE DEPARTMENT', { x: 205, y: 745, size: 18, font: bold });
    page.drawText('Placement Mock Examination Marksheet', { x: 165, y: 718, size: 13, font: bold });
    const lines = [
      ['Candidate', result.studentName],
      ['Roll number', result.rollNumber],
      ['Program', result.program],
      ['Examination', result.examName],
      ['Attendance', result.attendance],
      ['Started', result.startedAt],
      ['Submitted', result.submittedAt],
      ['Score', `${result.score} / ${result.maximumScore}`],
      ['Percentage', `${result.percentage.toFixed(2)}%`],
      ['Grade', result.grade],
      ['Result verification ID', result.id],
      ['Published', result.publishedAt],
    ];
    let y = 665;
    for (const [label, value] of lines) {
      page.drawText(label!, { x: 70, y, size: 10, font: bold });
      page.drawText(value!, { x: 210, y, size: 10, font });
      y -= 30;
    }
    page.drawText(`Generated ${new Date().toISOString()}`, { x: 70, y: 80, size: 8, font });
    return Buffer.from(await pdf.save());
  }

  async notifications(user: UserDocument): Promise<unknown[]> {
    return this.notificationModel
      .find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('publicId type title message status readAt createdAt')
      .lean()
      .exec();
  }

  async readNotification(publicId: string, user: UserDocument): Promise<void> {
    const outcome = await this.notificationModel.updateOne(
      { publicId, userId: user._id },
      { $set: { readAt: new Date() } },
    );
    if (!outcome.matchedCount) throw this.notFound('Notification');
  }

  async announce(
    title: string,
    message: string,
    programPublicIds: string[],
    actor: UserDocument,
    request: Request,
  ): Promise<{ queued: number }> {
    const programs = programPublicIds.length
      ? await this.programModel.find({ publicId: { $in: programPublicIds }, active: true }).exec()
      : [];
    if (programPublicIds.length && programs.length !== programPublicIds.length)
      throw new BadRequestException({
        code: 'PROGRAM_INVALID',
        message: 'Every announcement program must be active',
      });
    const users = await this.userModel
      .find({
        role: 'student',
        status: 'active',
        ...(programs.length ? { programId: { $in: programs.map((program) => program._id) } } : {}),
      })
      .exec();
    const announcementId = randomUUID();
    await this.notificationModel.insertMany(
      users.map((user) => ({
        publicId: randomUUID(),
        userId: user._id,
        type: 'announcement',
        title,
        message,
        email: user.email,
        idempotencyKey: `announcement:${announcementId}:${user.publicId}`,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
      })),
    );
    await this.audit.record({
      eventType: 'notification.announcement-queued',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'announcement',
      targetPublicId: announcementId,
      outcome: 'success',
      request,
      metadata: { recipientCount: users.length, programIds: programPublicIds.join(',') },
    });
    return { queued: users.length };
  }

  async finalizeExpiredAttempts(): Promise<void> {
    const expired = await this.attemptModel
      .find({
        status: { $in: ['in-progress', 'interrupted'] },
        $or: [{ endsAt: { $lte: new Date() } }, { sectionEndsAt: { $lte: new Date() } }],
      })
      .limit(100)
      .exec();
    for (const attempt of expired) {
      const version = await this.examVersionModel.findById(attempt.examVersionId).exec();
      if (!version) continue;
      if (
        attempt.sectionEndsAt <= new Date() &&
        attempt.currentSectionIndex < version.sections.length - 1 &&
        attempt.endsAt > new Date()
      ) {
        const now = new Date();
        attempt.currentSectionIndex += 1;
        attempt.sectionStartedAt = now;
        attempt.sectionEndsAt = new Date(
          Math.min(
            attempt.endsAt.getTime(),
            now.getTime() + version.sections[attempt.currentSectionIndex]!.durationSeconds * 1000,
          ),
        );
        await attempt.save();
      } else await this.submit(attempt.publicId, 'expired', null, null, null);
    }
  }

  async queueDueReminders(): Promise<void> {
    const now = new Date();
    const exams = await this.examModel
      .find({
        status: 'published',
        startAt: { $gt: now, $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      })
      .exec();
    for (const exam of exams) {
      const withinHour = exam.startAt.getTime() - now.getTime() <= 60 * 60 * 1000;
      await this.queueExamNotifications(
        exam,
        'exam-reminder',
        withinHour ? 'Examination starts within one hour' : 'Examination starts within 24 hours',
        `${exam.name} starts at ${exam.startAt.toISOString()}.`,
        withinHour ? 'one-hour' : 'one-day',
      );
    }
  }

  async deliverNotifications(): Promise<void> {
    const jobs = await this.notificationModel
      .find({
        status: { $in: ['pending', 'failed'] },
        nextAttemptAt: { $lte: new Date() },
        attempts: { $lt: 5 },
      })
      .limit(20)
      .exec();
    for (const job of jobs) {
      const claimed = await this.notificationModel
        .findOneAndUpdate(
          { _id: job._id, status: job.status },
          { $set: { status: 'processing' }, $inc: { attempts: 1 } },
          { new: true },
        )
        .exec();
      if (!claimed) continue;
      try {
        await this.mailer.sendNotification(claimed.email, claimed.title, claimed.message);
        claimed.status = 'sent';
        claimed.sentAt = new Date();
        claimed.set('lastError', undefined);
      } catch (error) {
        claimed.status = 'failed';
        claimed.lastError =
          error instanceof Error ? error.message.slice(0, 240) : 'SMTP delivery failed';
        claimed.nextAttemptAt = new Date(
          Date.now() + Math.min(300_000, 15_000 * 2 ** claimed.attempts),
        );
      }
      await claimed.save();
    }
  }

  private async publish(exam: ExamDocument, actor: UserDocument, request: Request): Promise<void> {
    if (exam.status !== 'draft')
      throw new ConflictException({
        code: 'EXAM_STATE_INVALID',
        message: 'Only a draft exam can be published',
      });
    await this.persistPublishedVersion(exam, actor, request, 'exam.published');
    await this.queueExamNotifications(
      exam,
      'exam-reminder',
      'Examination scheduled',
      `${exam.name} is scheduled for ${exam.startAt.toISOString()}.`,
    );
  }

  private async persistPublishedVersion(
    exam: ExamDocument,
    actor: UserDocument,
    request: Request,
    eventType: 'exam.published' | 'exam.modified',
  ): Promise<void> {
    const errors: string[] = [];
    if (!exam.passwordHash) errors.push('Exam password is required');
    if (exam.endEntryAt <= exam.startAt) errors.push('Entry window must end after the start time');
    if (
      exam.sections.reduce((sum, section) => sum + section.durationSeconds, 0) >
      exam.durationSeconds
    )
      errors.push('Section durations exceed total duration');
    if (exam.lockdownRequired && !exam.allowStandardBrowserFallback && !exam.sebConfigKeys.length)
      errors.push('At least one SEB Config Key is required');
    const versionSections: ExamVersionRecord['sections'] = [];
    for (const section of exam.sections) {
      const questions = await this.questionModel
        .find({ _id: { $in: section.questionIds }, status: 'active' })
        .exec();
      if (questions.length !== section.questionIds.length)
        errors.push(`${section.title}: every pool question must be active`);
      if (section.selectCount > questions.length)
        errors.push(`${section.title}: selection count exceeds pool size`);
      versionSections.push({
        publicId: section.publicId,
        title: section.title,
        instructions: section.instructions,
        durationSeconds: section.durationSeconds,
        questionVersionIds: questions.map((question) => question.currentVersionId),
        selectCount: section.selectCount,
        randomQuestionOrder: section.randomQuestionOrder,
        randomOptionOrder: section.randomOptionOrder,
        navigation: section.navigation,
      });
    }
    if (errors.length)
      throw new BadRequestException({
        code: 'EXAM_PUBLISH_VALIDATION_FAILED',
        message: errors.join('; '),
      });
    const versionId = new Types.ObjectId();
    const versionPublicId = randomUUID();
    await this.connection.transaction(async (databaseSession) => {
      await this.examVersionModel.create(
        [
          {
            _id: versionId,
            publicId: versionPublicId,
            examPublicId: exam.publicId,
            examId: exam._id,
            versionNumber: exam.currentVersion,
            name: exam.name,
            description: exam.description,
            instructions: exam.instructions,
            allowedProgramIds: exam.allowedProgramIds,
            startAt: exam.startAt,
            endEntryAt: exam.endEntryAt,
            durationSeconds: exam.durationSeconds,
            timezone: exam.timezone,
            lockdownRequired: exam.lockdownRequired,
            allowStandardBrowserFallback: exam.allowStandardBrowserFallback,
            sebConfigKeys: exam.sebConfigKeys,
            ...(exam.sebConfigurationUrl ? { sebConfigurationUrl: exam.sebConfigurationUrl } : {}),
            showQuestionReview: exam.showQuestionReview,
            showCorrectAnswers: exam.showCorrectAnswers,
            gradeBoundaries: exam.gradeBoundaries,
            sections: versionSections,
            createdBy: actor._id,
          },
        ],
        { session: databaseSession },
      );
      exam.status = 'published';
      exam.publishedVersionId = versionId;
      exam.publishedAt = new Date();
      exam.updatedBy = actor._id;
      await exam.save({ session: databaseSession });
      await this.audit.record({
        eventType,
        actorUserId: actor._id,
        actorRole: actor.role,
        targetType: 'exam',
        targetPublicId: exam.publicId,
        outcome: 'success',
        request,
        databaseSession,
        metadata: { version: exam.currentVersion },
      });
    });
  }

  private async resolveInput(
    input: ExamInput,
    creating: boolean,
  ): Promise<
    Omit<
      ExamRecord,
      | 'publicId'
      | 'status'
      | 'currentVersion'
      | 'createdBy'
      | 'updatedBy'
      | 'createdAt'
      | 'updatedAt'
    >
  > {
    const programs = await this.programModel
      .find({ publicId: { $in: input.allowedProgramIds }, active: true })
      .exec();
    if (programs.length !== input.allowedProgramIds.length)
      throw new BadRequestException({
        code: 'PROGRAM_INVALID',
        message: 'Every allowed program must be active',
      });
    const questionIds = [...new Set(input.sections.flatMap((section) => section.questionIds))];
    const questions = await this.questionModel.find({ publicId: { $in: questionIds } }).exec();
    if (questions.length !== questionIds.length)
      throw new BadRequestException({
        code: 'QUESTION_INVALID',
        message: 'One or more question IDs are invalid',
      });
    if (input.sections.some((section) => section.selectCount > section.questionIds.length))
      throw new BadRequestException({
        code: 'SECTION_SELECTION_INVALID',
        message: 'Section selection count cannot exceed its pool size',
      });
    if (
      input.sections.reduce((sum, section) => sum + section.durationSeconds, 0) >
      input.durationSeconds
    )
      throw new BadRequestException({
        code: 'SECTION_DURATION_INVALID',
        message: 'Section durations cannot exceed total duration',
      });
    if (new Date(input.endEntryAt) <= new Date(input.startAt))
      throw new BadRequestException({
        code: 'SCHEDULE_INVALID',
        message: 'Entry closing time must follow the start time',
      });
    const byPublicId = new Map(questions.map((question) => [question.publicId, question._id]));
    return {
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      allowedProgramIds: programs.map((program) => program._id),
      startAt: new Date(input.startAt),
      endEntryAt: new Date(input.endEntryAt),
      durationSeconds: input.durationSeconds,
      timezone: input.timezone,
      ...(input.password
        ? { passwordHash: this.hashPassword(input.password) }
        : creating
          ? {}
          : {}),
      lockdownRequired: input.lockdownRequired,
      allowStandardBrowserFallback: input.allowStandardBrowserFallback,
      sebConfigKeys: input.sebConfigKeys.map((key) => key.toLowerCase()),
      ...(input.sebConfigurationUrl ? { sebConfigurationUrl: input.sebConfigurationUrl } : {}),
      showQuestionReview: input.showQuestionReview,
      showCorrectAnswers: input.showCorrectAnswers,
      gradeBoundaries: input.gradeBoundaries,
      sections: input.sections.map((section) => ({
        publicId: section.id ?? randomUUID(),
        title: section.title,
        instructions: section.instructions,
        durationSeconds: section.durationSeconds,
        questionIds: section.questionIds.map((id) => byPublicId.get(id)!),
        selectCount: section.selectCount,
        randomQuestionOrder: section.randomQuestionOrder,
        randomOptionOrder: section.randomOptionOrder,
        navigation: section.navigation,
      })),
    };
  }

  private async buildInstances(
    version: ExamVersionDocument,
    seed: string,
  ): Promise<AttemptQuestionInstance[]> {
    const instances: AttemptQuestionInstance[] = [];
    for (const section of version.sections) {
      const versions = await this.questionVersionModel
        .find({ _id: { $in: section.questionVersionIds } })
        .exec();
      let selected = deterministicOrder(
        versions,
        seed,
        `select:${section.publicId}`,
        (question) => question.publicId,
      ).slice(0, section.selectCount);
      if (!section.randomQuestionOrder)
        selected = section.questionVersionIds
          .map((id) => versions.find((question) => question._id.equals(id))!)
          .filter(Boolean)
          .slice(0, section.selectCount);
      for (const question of selected) {
        const optionOrder = section.randomOptionOrder
          ? deterministicOrder(
              question.options,
              seed,
              `options:${question.publicId}`,
              (option) => option.id,
            ).map((option) => option.id)
          : question.options.map((option) => option.id);
        instances.push({
          publicId: randomUUID(),
          sectionId: section.publicId,
          questionVersionId: question._id,
          order: instances.length,
          optionOrder,
          marks: question.marks,
          negativeMarks: question.negativeMarks,
        });
      }
    }
    return instances;
  }

  private async view(attempt: AttemptDocument, version: ExamVersionDocument): Promise<AttemptView> {
    const section = version.sections[attempt.currentSectionIndex]!;
    const instances = attempt.questionInstances
      .filter((instance) => instance.sectionId === section.publicId)
      .sort((a, b) => a.order - b.order);
    const questionVersions = await this.questionVersionModel
      .find({ _id: { $in: instances.map((instance) => instance.questionVersionId) } })
      .exec();
    const answers = await this.answerModel.find({ attemptId: attempt._id }).exec();
    const mediaAssets = await this.mediaModel
      .find({
        _id: {
          $in: questionVersions.flatMap((question) => [
            ...question.mediaIds,
            ...question.options.flatMap((option) => (option.mediaId ? [option.mediaId] : [])),
          ]),
        },
      })
      .exec();
    const mediaPublicIds = new Map(
      mediaAssets.map((asset) => [asset._id.toHexString(), asset.publicId]),
    );
    const questions = instances.map((instance) => {
      const question = questionVersions.find((candidate) =>
        candidate._id.equals(instance.questionVersionId),
      )!;
      const options = instance.optionOrder
        .map((id) => question.options.find((option) => option.id === id)!)
        .filter(Boolean)
        .map((option) => ({
          id: option.id,
          text: option.text,
          ...(option.mediaId ? { mediaId: mediaPublicIds.get(option.mediaId.toHexString()) } : {}),
        }));
      return {
        instanceId: instance.publicId,
        id: question.publicId,
        version: question.versionNumber,
        type: question.type,
        prompt: question.prompt,
        options,
        marks: instance.marks,
        negativeMarks: instance.negativeMarks,
        difficulty: question.difficulty,
        tags: question.tags,
        mediaIds: question.mediaIds
          .map((id) => mediaPublicIds.get(id.toHexString()))
          .filter((id): id is string => Boolean(id)),
        chemicalStructure: question.chemicalStructure ?? null,
        numerical: question.numerical
          ? {
              unit: question.numerical.unit,
              decimalPlaces: question.numerical.decimalPlaces ?? null,
            }
          : null,
        markedForReview:
          answers.find((answer) => answer.questionInstanceId === instance.publicId)
            ?.markedForReview ?? false,
      };
    });
    return {
      id: attempt.publicId,
      examId: version.examPublicId,
      examName: version.name,
      status: attempt.status,
      serverTime: new Date().toISOString(),
      startedAt: attempt.startedAt.toISOString(),
      endsAt: attempt.endsAt.toISOString(),
      offlineLeaseExpiresAt: attempt.offlineLeaseExpiresAt.toISOString(),
      revision: attempt.revision,
      currentSectionIndex: attempt.currentSectionIndex,
      sectionCount: version.sections.length,
      sectionEndsAt: attempt.sectionEndsAt.toISOString(),
      section: {
        id: section.publicId,
        title: section.title,
        instructions: section.instructions,
        navigation: section.navigation,
      },
      questions,
      answers: Object.fromEntries(
        answers.map((answer) => [answer.questionInstanceId, answer.answer]),
      ),
      saveSequences: Object.fromEntries(
        answers.map((answer) => [answer.questionInstanceId, answer.sequence]),
      ),
    };
  }

  private async evaluate(
    attempt: AttemptDocument,
    version: ExamVersionDocument,
    resultVersion: number,
  ): Promise<ResultDocument> {
    const answers = await this.answerModel.find({ attemptId: attempt._id }).exec();
    const questionVersions = await this.questionVersionModel
      .find({
        _id: { $in: attempt.questionInstances.map((instance) => instance.questionVersionId) },
      })
      .exec();
    const rubrics = await this.rubricModel
      .find({
        questionVersionId: {
          $in: attempt.questionInstances.map((instance) => instance.questionVersionId),
        },
      })
      .select('+iv +ciphertext +authTag')
      .exec();
    const items: ResultItemRecord[] = [];
    for (const instance of attempt.questionInstances) {
      const question = questionVersions.find((candidate) =>
        candidate._id.equals(instance.questionVersionId),
      )!;
      const rubric = rubrics.find((candidate) =>
        candidate.questionVersionId.equals(instance.questionVersionId),
      )!;
      const answer = answers.find(
        (candidate) => candidate.questionInstanceId === instance.publicId,
      )?.answer;
      const score = scoreObjective(
        {
          type: question.type,
          marks: instance.marks,
          negativeMarks: instance.negativeMarks,
          rubric: this.crypto.decrypt(instance.questionVersionId, rubric),
        },
        answer,
      );
      items.push({
        questionInstanceId: instance.publicId,
        questionVersionId: question.publicId,
        sectionId: instance.sectionId,
        awardedMarks: score.awardedMarks,
        maximumMarks: instance.marks,
        correct: score.correct,
      });
    }
    const sectionScores = version.sections.map((section) => {
      const sectionItems = items.filter((item) => item.sectionId === section.publicId);
      return {
        sectionId: section.publicId,
        title: section.title,
        score: sectionItems.reduce((sum, item) => sum + item.awardedMarks, 0),
        maximumScore: sectionItems.reduce((sum, item) => sum + item.maximumMarks, 0),
      };
    });
    const score = items.reduce((sum, item) => sum + item.awardedMarks, 0);
    const maximumScore = items.reduce((sum, item) => sum + item.maximumMarks, 0);
    const percentage = maximumScore ? Math.max(0, (score / maximumScore) * 100) : 0;
    return this.resultModel.create({
      publicId: randomUUID(),
      attemptId: attempt._id,
      examId: attempt.examId,
      examVersionId: attempt.examVersionId,
      userId: attempt.userId,
      version: resultVersion,
      score,
      maximumScore,
      percentage,
      grade: gradeFor(percentage, version.gradeBoundaries),
      items,
      sectionScores,
      evaluationVersion,
      evaluatedAt: new Date(),
      published: false,
    });
  }

  private async resultView(result: ResultDocument, user: UserDocument): Promise<ResultView> {
    const exam = await this.examModel.findById(result.examId).exec();
    const attempt = await this.attemptModel.findById(result.attemptId).exec();
    const version = await this.examVersionModel.findById(result.examVersionId).exec();
    const program = user.programId ? await this.programModel.findById(user.programId).exec() : null;
    if (!exam || !attempt || !version || !result.publishedAt) throw this.notFound('Result details');
    let questionReview: ResultView['questionReview'];
    if (version.showQuestionReview) {
      const questionVersions = await this.questionVersionModel
        .find({ _id: { $in: attempt.questionInstances.map((item) => item.questionVersionId) } })
        .exec();
      const answers = await this.answerModel.find({ attemptId: attempt._id }).exec();
      const rubrics = version.showCorrectAnswers
        ? await this.rubricModel
            .find({ questionVersionId: { $in: questionVersions.map((item) => item._id) } })
            .select('+iv +ciphertext +authTag')
            .exec()
        : [];
      questionReview = result.items.map((item) => {
        const instance = attempt.questionInstances.find(
          (candidate) => candidate.publicId === item.questionInstanceId,
        )!;
        const question = questionVersions.find((candidate) =>
          candidate._id.equals(instance.questionVersionId),
        )!;
        const rubric = rubrics.find((candidate) =>
          candidate.questionVersionId.equals(instance.questionVersionId),
        );
        return {
          questionId: question.publicId,
          prompt: question.prompt,
          answer: answers.find(
            (candidate) => candidate.questionInstanceId === item.questionInstanceId,
          )?.answer,
          awardedMarks: item.awardedMarks,
          maximumMarks: item.maximumMarks,
          correct: item.correct,
          ...(rubric
            ? { correctAnswer: this.crypto.decrypt(instance.questionVersionId, rubric) }
            : {}),
        };
      });
    }
    return {
      id: result.publicId,
      examId: exam.publicId,
      examName: exam.name,
      studentName: user.fullName,
      rollNumber: user.rollNumber ?? '',
      program: program?.name ?? '',
      attendance:
        attempt.status === 'submitted'
          ? 'submitted'
          : attempt.status === 'auto-submitted'
            ? 'auto-submitted'
            : attempt.status === 'terminated'
              ? 'terminated'
              : 'interrupted',
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: (attempt.submittedAt ?? attempt.updatedAt).toISOString(),
      score: result.score,
      maximumScore: result.maximumScore,
      percentage: result.percentage,
      grade: result.grade,
      publishedAt: result.publishedAt.toISOString(),
      sectionScores: result.sectionScores,
      ...(questionReview ? { questionReview } : {}),
    };
  }

  private async ownedAttempt(
    publicId: string,
    user: UserDocument,
    session: HydratedSession,
  ): Promise<AttemptDocument> {
    const attempt = await this.attemptModel.findOne({ publicId, userId: user._id }).exec();
    if (!attempt) throw this.notFound('Attempt');
    if (attempt.deviceSessionId !== session.deviceSessionId)
      throw new ForbiddenException({
        code: 'ATTEMPT_DEVICE_MISMATCH',
        message: 'This attempt belongs to another authorized device session',
      });
    return attempt;
  }

  private async enforceTime(attempt: AttemptDocument, version: ExamVersionDocument): Promise<void> {
    const now = new Date();
    if (attempt.endsAt <= now) {
      await this.submit(attempt.publicId, 'expired', null, null, null);
      attempt.status = 'auto-submitted';
      return;
    }
    if (attempt.sectionEndsAt <= now && attempt.currentSectionIndex < version.sections.length - 1) {
      attempt.currentSectionIndex += 1;
      attempt.sectionStartedAt = now;
      attempt.sectionEndsAt = new Date(
        Math.min(
          attempt.endsAt.getTime(),
          now.getTime() + version.sections[attempt.currentSectionIndex]!.durationSeconds * 1000,
        ),
      );
      attempt.revision += 1;
      await attempt.save();
    } else if (attempt.sectionEndsAt <= now) {
      await this.submit(attempt.publicId, 'expired', null, null, null);
      attempt.status = 'auto-submitted';
    }
  }

  private validSebRequest(exam: ExamDocument, request: Request): boolean {
    const supplied = request.get('X-SafeExamBrowser-ConfigKeyHash')?.toLowerCase();
    if (!supplied || !/^[a-f0-9]{64}$/.test(supplied)) return false;
    const url = `${request.protocol}://${request.get('host')}${request.originalUrl}`;
    return exam.sebConfigKeys.some((key) =>
      this.safeEqual(
        supplied,
        createHash('sha256')
          .update(url + key)
          .digest('hex'),
      ),
    );
  }

  private accessToken(examId: string, userId: string, expires: number): string {
    const payload = `${examId}.${userId}.${expires}`;
    return `${payload}.${createHmac(
      'sha256',
      this.config.get('SESSION_TOKEN_PEPPER', { infer: true }),
    )
      .update(`exam-access:${payload}`)
      .digest('base64url')}`;
  }
  private verifyAccessToken(token: string, examId: string, userId: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 4) return false;
    const [tokenExam, tokenUser, expiresText] = parts;
    const expires = Number(expiresText);
    if (
      tokenExam !== examId ||
      tokenUser !== userId ||
      !Number.isInteger(expires) ||
      expires < Math.floor(Date.now() / 1000)
    )
      return false;
    return this.safeEqual(token, this.accessToken(examId, userId, expires));
  }
  private hashPassword(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 32);
    return `${salt.toString('base64')}:${hash.toString('base64')}`;
  }
  private verifyPassword(password: string, encoded: string): boolean {
    const [salt, expected] = encoded.split(':');
    if (!salt || !expected) return false;
    const actual = scryptSync(password, Buffer.from(salt, 'base64'), 32);
    const expectedBuffer = Buffer.from(expected, 'base64');
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  }
  private safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  private lease(now: Date, endsAt: Date): Date {
    return new Date(Math.min(endsAt.getTime(), now.getTime() + offlineLeaseSeconds * 1000));
  }
  private summary(exam: ExamDocument): ExamSummary {
    return {
      id: exam.publicId,
      name: exam.name,
      description: exam.description,
      status: exam.status,
      startAt: exam.startAt.toISOString(),
      endEntryAt: exam.endEntryAt.toISOString(),
      durationSeconds: exam.durationSeconds,
      timezone: exam.timezone,
      lockdownRequired: exam.lockdownRequired,
      ...(exam.sebConfigurationUrl ? { sebConfigurationUrl: exam.sebConfigurationUrl } : {}),
      version: exam.currentVersion,
      sectionCount: exam.sections.length,
    };
  }
  private duplicate(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }

  private async recordExport(
    examPublicId: string,
    actor: UserDocument,
    request: Request,
    format: 'xlsx' | 'pdf',
  ): Promise<void> {
    await this.audit.record({
      eventType: 'report.attendance-exported',
      actorUserId: actor._id,
      actorRole: actor.role,
      targetType: 'exam',
      targetPublicId: examPublicId,
      outcome: 'success',
      request,
      metadata: { format },
    });
  }
  private notFound(name: string): NotFoundException {
    return new NotFoundException({
      code: `${name.toUpperCase().replaceAll(' ', '_')}_NOT_FOUND`,
      message: `${name} not found`,
    });
  }

  private async queueExamNotifications(
    exam: ExamDocument,
    type: NotificationRecord['type'],
    title: string,
    message: string,
    keySuffix = 'lifecycle',
  ): Promise<void> {
    const users = await this.userModel
      .find({ role: 'student', status: 'active', programId: { $in: exam.allowedProgramIds } })
      .exec();
    await Promise.all(
      users.map((user) =>
        this.notificationModel.updateOne(
          {
            idempotencyKey: `${type}:${keySuffix}:${exam.publicId}:${user.publicId}:${exam.currentVersion}`,
          },
          {
            $setOnInsert: {
              publicId: randomUUID(),
              userId: user._id,
              type,
              title,
              message,
              email: user.email,
              idempotencyKey: `${type}:${keySuffix}:${exam.publicId}:${user.publicId}:${exam.currentVersion}`,
              status: 'pending',
              attempts: 0,
              nextAttemptAt: new Date(),
            },
          },
          { upsert: true },
        ),
      ),
    );
  }
  private async queueResultNotifications(exam: ExamDocument): Promise<void> {
    const results = await this.resultModel.find({ examId: exam._id, published: true }).exec();
    const users = await this.userModel
      .find({ _id: { $in: results.map((result) => result.userId) } })
      .exec();
    await Promise.all(
      users.map((user) =>
        this.notificationModel.updateOne(
          { idempotencyKey: `result-published:${exam.publicId}:${user.publicId}` },
          {
            $setOnInsert: {
              publicId: randomUUID(),
              userId: user._id,
              type: 'result-published',
              title: 'Result published',
              message: `Your result for ${exam.name} is now available.`,
              email: user.email,
              idempotencyKey: `result-published:${exam.publicId}:${user.publicId}`,
              status: 'pending',
              attempts: 0,
              nextAttemptAt: new Date(),
            },
          },
          { upsert: true },
        ),
      ),
    );
  }
}

type HydratedSession = HydratedDocument<SessionRecord>;
