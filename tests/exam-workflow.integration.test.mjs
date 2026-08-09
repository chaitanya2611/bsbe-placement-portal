import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const enabled = process.env.RUN_EXAM_INTEGRATION === 'true';

test(
  'real MongoDB exam lifecycle publishes, fixes an attempt, saves, scores, publishes, and exports',
  { skip: !enabled, timeout: 90_000 },
  async (context) => {
    const databaseName = `bsbe_exam_test_${randomUUID().replaceAll('-', '')}`;
    const baseUri =
      process.env.MONGODB_URI ??
      'mongodb://localhost:27017/bsbe_portal?replicaSet=rs0&directConnection=true';
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_ENABLED: 'true',
      MONGODB_URI: baseUri.replace(/\/[^/?]+(?=\?)/, `/${databaseName}`),
      OPENAPI_ENABLED: 'false',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
      INSTITUTE_EMAIL_DOMAIN: 'institute.test',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      OTP_PEPPER: 'integration-otp-pepper-at-least-thirty-two-characters',
      SESSION_TOKEN_PEPPER: 'integration-session-pepper-at-least-thirty-two-characters',
      CSRF_SECRET: 'integration-csrf-secret-at-least-thirty-two-characters',
      IP_HASH_KEY: 'integration-ip-hash-key-at-least-thirty-two-characters',
    });

    const { getConnectionToken, getModelToken } = apiRequire('@nestjs/mongoose');
    const { createApplication } = await import('../apps/api/dist/bootstrap.js');
    const { IDENTITY_MODELS } = require('../apps/api/dist/identity/identity.models.js');
    const {
      BootstrapAdminService,
    } = require('../apps/api/dist/identity/bootstrap-admin.service.js');
    const { SessionService } = require('../apps/api/dist/identity/session.service.js');
    const { MigrationService } = require('../apps/api/dist/identity/migration.service.js');
    const {
      QuestionMigrationService,
    } = require('../apps/api/dist/question-bank/question-migration.service.js');
    const { QuestionService } = require('../apps/api/dist/question-bank/question.service.js');
    const { ExamMigrationService } = require('../apps/api/dist/exams/exam-migration.service.js');
    const { ExamService } = require('../apps/api/dist/exams/exam.service.js');

    const app = await createApplication();
    await app.init();
    const connection = app.get(getConnectionToken());
    context.after(async () => {
      await connection.dropDatabase();
      await app.close();
    });
    await app.get(MigrationService).run();
    await app.get(QuestionMigrationService).run();
    await app.get(ExamMigrationService).run();

    const User = app.get(getModelToken(IDENTITY_MODELS.user));
    const Program = app.get(getModelToken(IDENTITY_MODELS.program));
    const admin = await app
      .get(BootstrapAdminService)
      .bootstrap('exam-admin@example.test', 'Exam Admin');
    const program = await Program.create({
      publicId: randomUUID(),
      code: 'TEST',
      name: 'Test Program',
      active: true,
    });
    const student = await User.create({
      publicId: randomUUID(),
      email: 'student@institute.test',
      fullName: 'Fictional Student',
      role: 'student',
      status: 'active',
      rollNumber: 'TEST-001',
      programId: program._id,
      securityRevision: 1,
      createdBy: admin._id,
    });
    const request = {
      headers: {},
      ip: '127.0.0.1',
      protocol: 'http',
      originalUrl: '/api/v1/student/exams/test/authorize',
      get: () => undefined,
    };
    const questions = app.get(QuestionService);
    const created = [];
    for (const definition of [
      {
        type: 'single-choice',
        prompt: 'Select alpha.',
        options: [
          { id: 'a', text: 'Alpha' },
          { id: 'b', text: 'Beta' },
        ],
        answer: { optionId: 'a' },
        marks: 2,
        negativeMarks: 0.5,
        difficulty: 'easy',
        tags: ['test'],
        explanation: 'Alpha is correct.',
        mediaIds: [],
      },
      {
        type: 'numerical',
        prompt: 'What is 6 × 7?',
        answer: { value: 42, toleranceMode: 'exact', tolerance: 0 },
        numerical: { unit: '', decimalPlaces: 0 },
        marks: 3,
        negativeMarks: 0,
        difficulty: 'easy',
        tags: ['test'],
        explanation: 'Six times seven is 42.',
        mediaIds: [],
      },
    ]) {
      const question = await questions.create(definition, admin, request);
      await questions.setStatus(
        question.questionId,
        'active',
        'Integration test activation',
        admin,
        request,
      );
      created.push(question);
    }
    const exams = app.get(ExamService);
    const startAt = new Date(Date.now() - 60_000);
    const draft = await exams.create(
      {
        name: 'Integration Examination',
        description: 'Real database workflow',
        instructions: 'Answer both questions.',
        allowedProgramIds: [program.publicId],
        startAt: startAt.toISOString(),
        endEntryAt: new Date(Date.now() + 300_000).toISOString(),
        durationSeconds: 600,
        timezone: 'Asia/Kolkata',
        password: 'TestExam123',
        lockdownRequired: false,
        allowStandardBrowserFallback: true,
        sebConfigKeys: [],
        showQuestionReview: true,
        showCorrectAnswers: false,
        gradeBoundaries: [
          { grade: 'A', minimumPercentage: 80 },
          { grade: 'F', minimumPercentage: 0 },
        ],
        sections: [
          {
            title: 'Section 1',
            instructions: 'Complete all.',
            durationSeconds: 600,
            questionIds: created.map((question) => question.questionId),
            selectCount: 2,
            randomQuestionOrder: true,
            randomOptionOrder: true,
            navigation: 'free',
          },
        ],
      },
      admin,
      request,
    );
    await exams.setStatus(draft.id, 'published', 'Integration publication', admin, request);
    const createdSession = await app.get(SessionService).createForUser(student);
    const authorization = await exams.authorize(draft.id, 'TestExam123', false, student, request);
    const attempt = await exams.start(
      draft.id,
      authorization.authorizationToken,
      randomUUID(),
      student,
      createdSession.session,
      request,
    );
    assert.equal(attempt.questions.length, 2);
    assert.equal(JSON.stringify(attempt).includes('optionId'), false);
    const saves = attempt.questions.map((question, index) => ({
      questionInstanceId: question.instanceId,
      sequence: 1,
      attemptRevision: attempt.revision,
      clientEventAt: new Date().toISOString(),
      answer: question.type === 'single-choice' ? 'a' : 42,
      markedForReview: index === 0,
    }));
    const saveResult = await exams.saveAnswers(
      attempt.id,
      saves,
      student,
      createdSession.session,
      request,
    );
    assert.equal(saveResult.saved.length, 2);
    const submission = await exams.submit(
      attempt.id,
      'student',
      randomUUID(),
      student,
      createdSession.session,
      request,
    );
    assert.equal(submission.status, 'submitted');
    assert.deepEqual(await exams.studentResults(student), []);
    const privateAdminResults = await exams.adminResults(draft.id);
    assert.equal(privateAdminResults.length, 1);
    assert.equal(privateAdminResults[0].studentName, 'Fictional Student');
    assert.equal(privateAdminResults[0].rollNumber, 'TEST-001');
    assert.equal(privateAdminResults[0].score, 5);
    assert.equal(privateAdminResults[0].published, false);
    assert.deepEqual(
      await exams.publishResults(draft.id, true, 'Integration publication', admin, request),
      { updated: 1 },
    );
    assert.equal((await exams.adminResults(draft.id))[0].published, true);
    const published = await exams.studentResults(student);
    assert.equal(published.length, 1);
    assert.equal(published[0].score, 5);
    assert.equal(published[0].grade, 'A');
    assert.equal(
      (await exams.marksheetPdf(published[0].id, student)).subarray(0, 4).toString(),
      '%PDF',
    );
    assert.equal(
      (await exams.attendanceXlsx(draft.id, admin, request)).subarray(0, 2).toString(),
      'PK',
    );
    assert.match(await exams.attendanceCsv(draft.id, admin, request), /Fictional Student/);
    const analytics = await exams.analytics(draft.id);
    assert.equal(analytics.statistics.sampleSize, 1);

    const futureStart = new Date(Date.now() + 3_600_000);
    const futureInput = {
      name: 'Future Editable Examination',
      description: 'Published editing lifecycle coverage',
      instructions: 'Answer the selected questions.',
      allowedProgramIds: [program.publicId],
      startAt: futureStart.toISOString(),
      endEntryAt: new Date(futureStart.getTime() + 300_000).toISOString(),
      durationSeconds: 600,
      timezone: 'Asia/Kolkata',
      password: 'FutureExam123',
      lockdownRequired: false,
      allowStandardBrowserFallback: true,
      sebConfigKeys: [],
      showQuestionReview: false,
      showCorrectAnswers: false,
      gradeBoundaries: [
        { grade: 'A', minimumPercentage: 80 },
        { grade: 'F', minimumPercentage: 0 },
      ],
      sections: [
        {
          title: 'Editable section',
          instructions: 'Complete all.',
          durationSeconds: 600,
          questionIds: created.map((question) => question.questionId),
          selectCount: 2,
          randomQuestionOrder: true,
          randomOptionOrder: true,
          navigation: 'free',
        },
      ],
    };
    const futureDraft = await exams.create(futureInput, admin, request);
    const draftDetail = await exams.adminDetail(futureDraft.id);
    assert.equal(draftDetail.name, futureInput.name);
    assert.equal(draftDetail.hasPassword, true);
    assert.deepEqual(draftDetail.allowedProgramIds, [program.publicId]);
    assert.deepEqual(
      draftDetail.sections[0].questionIds.sort(),
      created.map((question) => question.questionId).sort(),
    );

    await exams.setStatus(
      futureDraft.id,
      'published',
      'Published edit integration coverage',
      admin,
      request,
    );
    const publishedEdit = { ...futureInput };
    delete publishedEdit.password;
    const revisedStart = new Date(futureStart.getTime() + 1_800_000);
    const revised = await exams.update(
      futureDraft.id,
      {
        ...publishedEdit,
        name: 'Revised Future Examination',
        startAt: revisedStart.toISOString(),
        endEntryAt: new Date(revisedStart.getTime() + 300_000).toISOString(),
      },
      admin,
      request,
    );
    assert.equal(revised.status, 'published');
    assert.equal(revised.version, 2);
    assert.equal((await exams.adminDetail(futureDraft.id)).hasPassword, true);
    assert.equal(
      (await exams.studentSchedule(student)).find((exam) => exam.id === futureDraft.id)?.name,
      'Revised Future Examination',
    );

    await assert.rejects(
      exams.update(draft.id, publishedEdit, admin, request),
      (error) => error?.getResponse?.().code === 'EXAM_ENTRY_STARTED',
    );
  },
);
