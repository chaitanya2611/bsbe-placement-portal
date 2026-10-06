import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  describeAnswer,
  formatDuration,
  performancePdf,
  performanceStatistics,
  performanceXlsx,
  questionPaperDocx,
  questionPaperPdf,
  rankPerformance,
} = require('../apps/api/dist/exams/exam-reports.js');
const ExcelJS = createRequire(new URL('../apps/api/package.json', import.meta.url))('exceljs');

const started = new Date('2026-08-09T10:15:00Z');
const row = (studentName, score) => ({
  rollNumber: studentName.slice(0, 3).toUpperCase(),
  studentName,
  email: `${studentName.toLowerCase()}@iitb.ac.in`,
  program: 'MTech',
  attendance: 'submitted',
  startedAt: started,
  submittedAt: new Date(started.getTime() + 125_000),
  score,
  maximumScore: 10,
  percentage: Math.max(0, score * 10),
  grade: score >= 8 ? 'A' : 'F',
  published: true,
  sectionScores: [{ title: 'Quant', score: Math.max(0, score), maximumScore: 10 }],
});

const paper = {
  examName: 'Mock Test',
  instructions: 'Line one\nLine two',
  durationSeconds: 1800,
  sections: [
    {
      title: 'Section A',
      instructions: '',
      selectCount: 0,
      questions: [
        {
          type: 'single-choice',
          prompt: 'Speed ≤ 72 km/h?',
          options: [
            { id: 'a', text: '60' },
            { id: 'b', text: '72' },
          ],
          marks: 1,
          negativeMarks: 0.25,
          difficulty: 'easy',
          explanation: 'Because.',
          answer: { optionId: 'b' },
        },
        {
          type: 'numerical',
          prompt: 'Value?',
          options: [],
          marks: 2,
          negativeMarks: 0,
          difficulty: 'medium',
          explanation: '',
          numericalUnit: 'm',
          answer: { value: 5, toleranceMode: 'absolute', tolerance: 0.5 },
        },
      ],
    },
  ],
};

test('performance rows are ranked by score with shared ranks for ties', () => {
  const ranked = rankPerformance([row('Cara', 6), row('Asha', 8), row('Ben', 8), row('Dev', -1)]);
  assert.deepEqual(
    ranked.map((item) => [item.studentName, item.rank]),
    [
      ['Asha', 1],
      ['Ben', 1],
      ['Cara', 3],
      ['Dev', 4],
    ],
  );
  const stats = performanceStatistics(ranked);
  assert.equal(stats.candidates, 4);
  assert.equal(stats.median, 7);
  assert.equal(stats.highest, 8);
  assert.equal(stats.lowest, -1);
  assert.equal(formatDuration(started, new Date(started.getTime() + 125_000)), '2m 05s');
});

test('answer key describes each question type', () => {
  assert.equal(describeAnswer(paper.sections[0].questions[0]), 'B. 72');
  assert.equal(describeAnswer(paper.sections[0].questions[1]), '5 m (±0.5 m)');
  assert.equal(
    describeAnswer({ type: 'true-false', options: [], answer: { value: false } }),
    'False',
  );
  assert.equal(
    describeAnswer({
      type: 'multiple-select',
      options: [
        { id: 'x', text: 'one' },
        { id: 'y', text: 'two' },
      ],
      answer: { optionIds: ['x', 'y'] },
    }),
    'A. one; B. two',
  );
});

test('performance exports produce a PDF and a workbook with one row per student', async () => {
  const report = {
    examName: 'Mock Test',
    examStartAt: started,
    timezone: 'Asia/Kolkata',
    rows: rankPerformance(
      Array.from({ length: 60 }, (_, index) => row(`Student${index}`, index % 11)),
    ),
  };
  const pdf = await performancePdf(report);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await performanceXlsx(report));
  const sheet = workbook.getWorksheet('Performance');
  assert.equal(sheet.rowCount, 61);
  assert.equal(sheet.getRow(1).getCell(1).value, 'Rank');
  assert.ok(workbook.getWorksheet('Summary'));
});

test('question paper and answer key render as PDF and Word, including non-Latin symbols', async () => {
  for (const withAnswers of [false, true]) {
    const pdf = await questionPaperPdf(paper, withAnswers);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const docx = await questionPaperDocx(paper, withAnswers);
    assert.equal(docx.subarray(0, 2).toString(), 'PK');
  }
  const empty = await performancePdf({
    examName: 'Empty',
    examStartAt: started,
    timezone: 'Asia/Kolkata',
    rows: [],
  });
  assert.equal(empty.subarray(0, 5).toString(), '%PDF-');
});
