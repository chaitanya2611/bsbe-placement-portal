import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { AppModule } from '../app.module';
import { JsonLogger } from '../common/json.logger';
import { ExamMigrationService } from '../exams/exam-migration.service';
import { EXAM_MODELS, type ExamRecord } from '../exams/exam.models';
import { ExamService } from '../exams/exam.service';
import { IDENTITY_MODELS, type ProgramRecord, type UserRecord } from '../identity/identity.models';
import { MigrationService } from '../identity/migration.service';
import { QuestionMigrationService } from '../question-bank/question-migration.service';
import { MediaService } from '../question-bank/media.service';
import { QuestionService } from '../question-bank/question.service';
import { SeedRunner } from './seed.runner';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const application = apply
    ? await NestFactory.createApplicationContext(AppModule, {
        logger: new JsonLogger(process.env.NODE_ENV ?? 'development'),
      })
    : undefined;
  const programModel = application?.get<Model<ProgramRecord>>(
    getModelToken(IDENTITY_MODELS.program),
  );
  const userModel = application?.get<Model<UserRecord>>(getModelToken(IDENTITY_MODELS.user));
  const examModel = application?.get<Model<ExamRecord>>(getModelToken(EXAM_MODELS.exam));
  const questionService = application?.get(QuestionService);
  const mediaService = application?.get(MediaService);
  const examService = application?.get(ExamService);
  const runner = new SeedRunner([
    {
      id: 'phase2-fictional-programs',
      description: 'Upsert the fictional M.Tech., M.Sc., and Ph.D. program reference data',
      async run() {
        if (!programModel) throw new Error('Program model is unavailable');
        for (const program of [
          { code: 'MTECH', name: 'M.Tech.' },
          { code: 'MSC', name: 'M.Sc.' },
          { code: 'PHD', name: 'Ph.D.' },
        ]) {
          await programModel.updateOne(
            { code: program.code },
            {
              $setOnInsert: { publicId: randomUUID(), ...program },
              $set: { active: true },
            },
            { upsert: true },
          );
        }
      },
    },
    {
      id: 'phase4-12-fictional-exam-workflow',
      description:
        'Create fictional candidates, scientific questions, and a scheduled two-section mock exam',
      async run(context) {
        if (
          !programModel ||
          !userModel ||
          !examModel ||
          !mediaService ||
          !questionService ||
          !examService
        )
          throw new Error('Demonstration seed services are unavailable');
        if (await examModel.exists({ name: 'Fictional BSBE Placement Readiness Mock' })) return;
        const admin = await userModel.findOne({ role: 'admin', status: 'active' }).exec();
        if (!admin) {
          context.log(
            'Skipped fictional exam data because the secure administrator bootstrap has not run yet; rerun seed afterward.',
          );
          return;
        }
        const programs = await programModel.find({ code: { $in: ['MTECH', 'MSC', 'PHD'] } }).exec();
        for (const candidate of [
          {
            email: 'fictional.mtech@iitb.ac.in',
            fullName: 'Fictional M.Tech. Candidate',
            rollNumber: 'DEMO-MT-001',
            code: 'MTECH',
          },
          {
            email: 'fictional.msc@iitb.ac.in',
            fullName: 'Fictional M.Sc. Candidate',
            rollNumber: 'DEMO-MS-001',
            code: 'MSC',
          },
          {
            email: 'fictional.phd@iitb.ac.in',
            fullName: 'Fictional Ph.D. Candidate',
            rollNumber: 'DEMO-PH-001',
            code: 'PHD',
          },
        ]) {
          const program = programs.find((item) => item.code === candidate.code);
          if (!program) continue;
          await userModel.updateOne(
            { email: candidate.email },
            {
              $setOnInsert: {
                publicId: randomUUID(),
                email: candidate.email,
                fullName: candidate.fullName,
                rollNumber: candidate.rollNumber,
                programId: program._id,
                role: 'student',
                status: 'active',
                securityRevision: 1,
                createdBy: admin._id,
              },
            },
            { upsert: true },
          );
        }
        const request = {
          headers: {},
          ip: '127.0.0.1',
          get: () => undefined,
        } as unknown as Request;
        const referenceImage = await mediaService.upload(
          {
            fieldname: 'file',
            originalname: 'fictional-cell-reference.png',
            encoding: '7bit',
            mimetype: 'image/png',
            size: 68,
            buffer: Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              'base64',
            ),
            destination: '',
            filename: '',
            path: '',
            stream: undefined as never,
          },
          admin,
          request,
        );
        const definitions = [
          {
            type: 'single-choice' as const,
            prompt:
              'Which organelle is principally responsible for ATP production in a eukaryotic cell?',
            options: [
              { id: 'a', text: 'Mitochondrion' },
              { id: 'b', text: 'Golgi apparatus' },
              { id: 'c', text: 'Lysosome' },
            ],
            answer: { optionId: 'a' },
            marks: 2,
            negativeMarks: 0.5,
            difficulty: 'easy' as const,
            tags: ['cell-biology'],
            explanation: 'Oxidative phosphorylation occurs in mitochondria.',
            mediaIds: [referenceImage.id],
          },
          {
            type: 'multiple-select' as const,
            prompt: 'Select the techniques that can be used to study protein abundance.',
            options: [
              { id: 'a', text: 'Western blotting' },
              { id: 'b', text: 'Mass spectrometry' },
              { id: 'c', text: 'PCR without reverse transcription' },
            ],
            answer: { optionIds: ['a', 'b'] },
            marks: 3,
            negativeMarks: 1,
            difficulty: 'medium' as const,
            tags: ['biochemistry'],
            explanation: 'Western blotting and proteomic mass spectrometry measure proteins.',
            mediaIds: [],
          },
          {
            type: 'true-false' as const,
            prompt: 'DNA polymerases synthesize DNA in the 5′ to 3′ direction.',
            answer: { value: true },
            marks: 1,
            negativeMarks: 0,
            difficulty: 'easy' as const,
            tags: ['molecular-biology'],
            explanation: 'Nucleotides are added to the 3′ hydroxyl end.',
            mediaIds: [],
          },
          {
            type: 'numerical' as const,
            prompt: 'Evaluate $$2^5 + 4$$.',
            answer: { value: 36, toleranceMode: 'exact' as const, tolerance: 0 },
            numerical: { unit: '', decimalPlaces: 0 },
            marks: 2,
            negativeMarks: 0,
            difficulty: 'easy' as const,
            tags: ['quantitative'],
            explanation: '2^5 is 32; adding 4 gives 36.',
            mediaIds: [],
          },
          {
            type: 'single-choice' as const,
            prompt: 'The displayed SMILES structure CCO represents which common molecule?',
            options: [
              { id: 'a', text: 'Ethanol' },
              { id: 'b', text: 'Methane' },
              { id: 'c', text: 'Acetic acid' },
            ],
            answer: { optionId: 'a' },
            chemicalStructure: { format: 'smiles' as const, source: 'CCO' },
            marks: 2,
            negativeMarks: 0.5,
            difficulty: 'medium' as const,
            tags: ['chemistry'],
            explanation: 'CCO is the SMILES representation of ethanol.',
            mediaIds: [],
          },
        ];
        const questionIds: string[] = [];
        for (const definition of definitions) {
          const created = await questionService.create(definition, admin, request);
          questionIds.push(created.questionId);
          await questionService.setStatus(
            created.questionId,
            'active',
            'Fictional demonstration exam seed',
            admin,
            request,
          );
        }
        const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const endEntry = new Date(start.getTime() + 30 * 60 * 1000);
        const draft = await examService.create(
          {
            name: 'Fictional BSBE Placement Readiness Mock',
            description:
              'Safe fictional demonstration assessment covering biological and quantitative reasoning.',
            instructions:
              'Complete both timed sections. Do not use external resources. This demonstration contains no real placement questions.',
            allowedProgramIds: programs.map((program) => program.publicId),
            startAt: start.toISOString(),
            endEntryAt: endEntry.toISOString(),
            durationSeconds: 3600,
            timezone: 'Asia/Kolkata',
            password: 'DemoExam2026',
            lockdownRequired: false,
            allowStandardBrowserFallback: true,
            sebConfigKeys: [],
            showQuestionReview: true,
            showCorrectAnswers: false,
            gradeBoundaries: [
              { grade: 'A', minimumPercentage: 80 },
              { grade: 'B', minimumPercentage: 65 },
              { grade: 'C', minimumPercentage: 50 },
              { grade: 'D', minimumPercentage: 40 },
              { grade: 'F', minimumPercentage: 0 },
            ],
            sections: [
              {
                title: 'Biological reasoning',
                instructions: 'Answer all selected questions.',
                durationSeconds: 1800,
                questionIds: questionIds.slice(0, 3),
                selectCount: 3,
                randomQuestionOrder: true,
                randomOptionOrder: true,
                navigation: 'free',
              },
              {
                title: 'Quantitative and chemical reasoning',
                instructions: 'Numerical and structure questions.',
                durationSeconds: 1800,
                questionIds: questionIds.slice(3),
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
        await examService.setStatus(
          draft.id,
          'published',
          'Publish fictional demonstration schedule',
          admin,
          request,
        );
      },
    },
  ]);
  if (application) {
    await application.get(MigrationService).run();
    await application.get(QuestionMigrationService).run();
    await application.get(ExamMigrationService).run();
  }
  const result = await runner.run({
    dryRun: !apply,
    log: (message) => process.stdout.write(`${message}\n`),
  });

  process.stdout.write(
    `${result.dryRun ? 'Dry run' : 'Seed run'} completed with ${result.executedTaskIds.length} task(s).\n`,
  );
  await application?.close();
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Seed failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
