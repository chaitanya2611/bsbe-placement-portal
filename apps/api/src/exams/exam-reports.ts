import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import ExcelJS from 'exceljs';
import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib';

const BRAND = rgb(0.08, 0.2, 0.32);
const MUTED = rgb(0.38, 0.42, 0.48);
const RULE = rgb(0.82, 0.85, 0.88);

export interface PerformanceRow {
  rank: number;
  rollNumber: string;
  studentName: string;
  email: string;
  program: string;
  attendance: string;
  startedAt: Date | null;
  submittedAt: Date | null;
  score: number;
  maximumScore: number;
  percentage: number;
  grade: string;
  published: boolean;
  sectionScores: Array<{ title: string; score: number; maximumScore: number }>;
}

export interface PerformanceReport {
  examName: string;
  examStartAt: Date;
  timezone: string;
  rows: PerformanceRow[];
}

export interface PaperOption {
  id: string;
  text: string;
}

export interface PaperQuestion {
  type: string;
  prompt: string;
  options: PaperOption[];
  marks: number;
  negativeMarks: number;
  difficulty: string;
  explanation: string;
  numericalUnit?: string;
  answer?: unknown;
}

export interface PaperSection {
  title: string;
  instructions: string;
  selectCount: number;
  questions: PaperQuestion[];
}

export interface QuestionPaper {
  examName: string;
  instructions: string;
  durationSeconds: number;
  sections: PaperSection[];
}

export interface PerformanceStatistics {
  candidates: number;
  average: number;
  median: number;
  highest: number;
  lowest: number;
  maximumScore: number;
}

/** Ranks rows by score (ties share a rank) and returns them highest first. */
export function rankPerformance(rows: Array<Omit<PerformanceRow, 'rank'>>): PerformanceRow[] {
  const sorted = [...rows].sort(
    (left, right) => right.score - left.score || left.studentName.localeCompare(right.studentName),
  );
  let previousScore: number | undefined;
  let previousRank = 0;
  return sorted.map((row, index) => {
    const rank = row.score === previousScore ? previousRank : index + 1;
    previousScore = row.score;
    previousRank = rank;
    return { ...row, rank };
  });
}

export function performanceStatistics(rows: PerformanceRow[]): PerformanceStatistics {
  const scores = rows.map((row) => row.score).sort((left, right) => left - right);
  if (!scores.length)
    return { candidates: 0, average: 0, median: 0, highest: 0, lowest: 0, maximumScore: 0 };
  const middle = Math.floor(scores.length / 2);
  return {
    candidates: scores.length,
    average: scores.reduce((sum, value) => sum + value, 0) / scores.length,
    median: scores.length % 2 ? scores[middle]! : (scores[middle - 1]! + scores[middle]!) / 2,
    highest: scores[scores.length - 1]!,
    lowest: scores[0]!,
    maximumScore: Math.max(...rows.map((row) => row.maximumScore)),
  };
}

export function formatDateTime(value: Date | null, timezone: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

export function formatDuration(startedAt: Date | null, submittedAt: Date | null): string {
  if (!startedAt || !submittedAt) return '';
  const totalSeconds = Math.max(
    0,
    Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000),
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const optionLabel = (index: number): string => String.fromCharCode(65 + index);

/** Human-readable correct answer for the answer key. */
export function describeAnswer(question: PaperQuestion): string {
  const answer = question.answer as Record<string, unknown> | undefined;
  if (!answer) return '';
  const optionText = (id: unknown): string => {
    const index = question.options.findIndex((option) => option.id === id);
    return index < 0 ? String(id) : `${optionLabel(index)}. ${question.options[index]!.text}`;
  };
  if (question.type === 'single-choice') return optionText(answer.optionId);
  if (question.type === 'multiple-select')
    return Array.isArray(answer.optionIds) ? answer.optionIds.map(optionText).join('; ') : '';
  if (question.type === 'true-false') return answer.value === true ? 'True' : 'False';
  if (question.type === 'numerical') {
    const unit = question.numericalUnit ? ` ${question.numericalUnit}` : '';
    const value = typeof answer.value === 'number' ? String(answer.value) : '';
    const tolerance = typeof answer.tolerance === 'number' ? answer.tolerance : 0;
    if (!tolerance || answer.toleranceMode === 'exact') return `${value}${unit}`;
    return answer.toleranceMode === 'relative'
      ? `${value}${unit} (±${round2(tolerance * 100)}%)`
      : `${value}${unit} (±${tolerance}${unit})`;
  }
  return '';
}

const questionTypeLabel: Record<string, string> = {
  'single-choice': 'Single correct',
  'multiple-select': 'Multiple correct',
  'true-false': 'True / False',
  numerical: 'Numerical answer',
};

function marksLabel(question: PaperQuestion): string {
  const negative = question.negativeMarks ? `, -${question.negativeMarks} for wrong` : '';
  return `${question.marks} mark${question.marks === 1 ? '' : 's'}${negative}`;
}

function totalMarks(paper: QuestionPaper): number {
  return paper.sections.reduce((sum, section) => {
    const marks = section.questions.map((question) => question.marks);
    const counted =
      section.selectCount && section.selectCount < marks.length
        ? (marks.reduce((a, b) => a + b, 0) / marks.length) * section.selectCount
        : marks.reduce((a, b) => a + b, 0);
    return sum + counted;
  }, 0);
}

/* ------------------------------------------------------------------ */
/* PDF helpers                                                         */
/* ------------------------------------------------------------------ */

/** The standard PDF fonts only cover WinAnsi; swap anything else for a close ASCII form. */
function pdfSafe(font: PDFFont, text: string): string {
  const replacements: Record<string, string> = {
    '≤': '<=',
    '≥': '>=',
    '≠': '!=',
    '−': '-',
    '×': 'x',
    '√': 'sqrt',
    π: 'pi',
    '→': '->',
    '₹': 'Rs.',
    ' ': ' ',
    ' ': ' ',
  };
  let output = '';
  for (const character of text.replace(/\r\n?/g, '\n')) {
    const replacement = replacements[character] ?? character;
    if (replacement === '\n') {
      output += replacement;
      continue;
    }
    try {
      font.encodeText(replacement);
      output += replacement;
    } catch {
      output += '?';
    }
  }
  return output;
}

function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfSafe(font, text).split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      let remainder = word;
      while (font.widthOfTextAtSize(remainder, size) > maxWidth && remainder.length > 1) {
        let cut = remainder.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(remainder.slice(0, cut), size) > maxWidth)
          cut -= 1;
        lines.push(remainder.slice(0, cut));
        remainder = remainder.slice(cut);
      }
      current = remainder;
    }
    lines.push(current);
  }
  return lines;
}

class PdfWriter {
  page!: PDFPage;
  y = 0;
  readonly margin = 42;
  constructor(
    readonly pdf: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly size: [number, number],
    readonly footer: string,
  ) {
    this.newPage();
  }
  get width(): number {
    return this.size[0] - this.margin * 2;
  }
  newPage(): void {
    this.page = this.pdf.addPage(this.size);
    this.y = this.size[1] - this.margin;
  }
  ensure(height: number): void {
    if (this.y - height < this.margin + 18) this.newPage();
  }
  text(
    value: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gap?: number;
    } = {},
  ): void {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.font;
    const indent = options.indent ?? 0;
    const lineHeight = size * 1.35;
    for (const line of wrapLines(font, value, size, this.width - indent)) {
      this.ensure(lineHeight);
      this.page.drawText(line, {
        x: this.margin + indent,
        y: this.y - size,
        size,
        font,
        color: options.color ?? rgb(0.1, 0.12, 0.15),
      });
      this.y -= lineHeight;
    }
    this.y -= options.gap ?? 0;
  }
  rule(): void {
    this.ensure(8);
    this.page.drawLine({
      start: { x: this.margin, y: this.y - 3 },
      end: { x: this.size[0] - this.margin, y: this.y - 3 },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= 10;
  }
  finish(): void {
    const pages = this.pdf.getPages();
    pages.forEach((page, index) => {
      const label = pdfSafe(this.font, `${this.footer}  |  Page ${index + 1} of ${pages.length}`);
      page.drawText(label, { x: this.margin, y: 22, size: 7.5, font: this.font, color: MUTED });
    });
  }
}

/* ------------------------------------------------------------------ */
/* Performance summary                                                 */
/* ------------------------------------------------------------------ */

export async function performancePdf(report: PerformanceReport): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${report.examName} - Performance summary`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(
    pdf,
    font,
    bold,
    [842, 595],
    `BSBE Placement Mock Test Portal - generated ${formatDateTime(new Date(), report.timezone)}`,
  );
  const stats = performanceStatistics(report.rows);

  writer.text('BSBE Department - Student Performance Summary', {
    size: 16,
    bold: true,
    color: BRAND,
    gap: 2,
  });
  writer.text(report.examName, { size: 12, bold: true, gap: 2 });
  writer.text(`Exam date: ${formatDateTime(report.examStartAt, report.timezone)}`, {
    size: 9,
    color: MUTED,
    gap: 8,
  });
  writer.text(
    stats.candidates
      ? `Candidates: ${stats.candidates}  |  Average: ${round2(stats.average)} / ${stats.maximumScore}  |  Median: ${round2(stats.median)}  |  Highest: ${stats.highest}  |  Lowest: ${stats.lowest}`
      : 'No evaluated attempts for this examination yet.',
    { size: 10, bold: true, gap: 6 },
  );
  if (!stats.candidates) {
    writer.finish();
    return Buffer.from(await pdf.save());
  }

  const sectionTitles = [
    ...new Set(report.rows.flatMap((row) => row.sectionScores.map((s) => s.title))),
  ];
  const columns: Array<{ label: string; width: number; value: (row: PerformanceRow) => string }> = [
    { label: 'Rank', width: 34, value: (row) => String(row.rank) },
    { label: 'Roll no.', width: 70, value: (row) => row.rollNumber },
    { label: 'Name', width: 150, value: (row) => row.studentName },
    { label: 'Program', width: 70, value: (row) => row.program },
    { label: 'Status', width: 72, value: (row) => row.attendance },
    { label: 'Score', width: 56, value: (row) => `${row.score}/${row.maximumScore}` },
    { label: '%', width: 44, value: (row) => row.percentage.toFixed(1) },
    { label: 'Grade', width: 38, value: (row) => row.grade },
    { label: 'Time', width: 54, value: (row) => formatDuration(row.startedAt, row.submittedAt) },
  ];
  const remaining = writer.width - columns.reduce((sum, column) => sum + column.width, 0);
  if (sectionTitles.length) {
    columns.push({
      label: 'Sections',
      width: remaining,
      value: (row) =>
        row.sectionScores
          .map((section) => `${section.title}: ${section.score}/${section.maximumScore}`)
          .join('  '),
    });
  }

  const drawRow = (cells: string[], header: boolean): void => {
    const size = 8.5;
    const cellFont = header ? bold : font;
    const wrapped = cells.map((cell, index) =>
      wrapLines(cellFont, cell, size, columns[index]!.width - 6),
    );
    const height = Math.max(...wrapped.map((lines) => lines.length)) * size * 1.3 + 6;
    writer.ensure(height);
    if (header)
      writer.page.drawRectangle({
        x: writer.margin,
        y: writer.y - height,
        width: writer.width,
        height,
        color: rgb(0.92, 0.95, 0.97),
      });
    let x = writer.margin;
    wrapped.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => {
        writer.page.drawText(line, {
          x: x + 3,
          y: writer.y - 3 - size - lineIndex * size * 1.3,
          size,
          font: cellFont,
          color: header ? BRAND : rgb(0.1, 0.12, 0.15),
        });
      });
      x += columns[index]!.width;
    });
    writer.y -= height;
    writer.page.drawLine({
      start: { x: writer.margin, y: writer.y },
      end: { x: writer.margin + writer.width, y: writer.y },
      thickness: 0.4,
      color: RULE,
    });
  };

  const header = columns.map((column) => column.label);
  drawRow(header, true);
  for (const row of report.rows) {
    if (writer.y - 24 < writer.margin + 18) {
      writer.newPage();
      drawRow(header, true);
    }
    drawRow(
      columns.map((column) => column.value(row)),
      false,
    );
  }
  const unpublished = report.rows.filter((row) => !row.published).length;
  writer.y -= 8;
  if (unpublished)
    writer.text(`${unpublished} result(s) are not yet published to students.`, {
      size: 8.5,
      color: MUTED,
    });
  writer.finish();
  return Buffer.from(await pdf.save());
}

export async function performanceXlsx(report: PerformanceReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BSBE Placement Mock Test Portal';
  workbook.created = new Date();
  const stats = performanceStatistics(report.rows);
  const sectionTitles = [
    ...new Set(report.rows.flatMap((row) => row.sectionScores.map((s) => s.title))),
  ];

  const sheet = workbook.addWorksheet('Performance', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Rank', key: 'rank', width: 7 },
    { header: 'Roll number', key: 'rollNumber', width: 15 },
    { header: 'Student', key: 'studentName', width: 28 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Program', key: 'program', width: 14 },
    { header: 'Status', key: 'attendance', width: 15 },
    { header: 'Started', key: 'startedAt', width: 20 },
    { header: 'Submitted', key: 'submittedAt', width: 20 },
    { header: 'Time taken', key: 'timeTaken', width: 12 },
    { header: 'Score', key: 'score', width: 9 },
    { header: 'Maximum', key: 'maximumScore', width: 10 },
    { header: 'Percentage', key: 'percentage', width: 12 },
    { header: 'Grade', key: 'grade', width: 8 },
    ...sectionTitles.map((title, index) => ({ header: title, key: `section${index}`, width: 16 })),
    { header: 'Published', key: 'published', width: 11 },
  ];
  for (const row of report.rows) {
    const sectionValues = Object.fromEntries(
      sectionTitles.map((title, index) => {
        const section = row.sectionScores.find((candidate) => candidate.title === title);
        return [`section${index}`, section ? section.score : null];
      }),
    );
    sheet.addRow({
      ...row,
      startedAt: formatDateTime(row.startedAt, report.timezone),
      submittedAt: formatDateTime(row.submittedAt, report.timezone),
      timeTaken: formatDuration(row.startedAt, row.submittedAt),
      percentage: round2(row.percentage),
      published: row.published ? 'Yes' : 'No',
      ...sectionValues,
    });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FF14334F' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1F6' } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { header: 'Measure', key: 'measure', width: 22 },
    { header: 'Value', key: 'value', width: 40 },
  ];
  summary.addRows([
    { measure: 'Examination', value: report.examName },
    { measure: 'Exam date', value: formatDateTime(report.examStartAt, report.timezone) },
    { measure: 'Candidates', value: stats.candidates },
    { measure: 'Maximum score', value: stats.maximumScore },
    { measure: 'Average score', value: round2(stats.average) },
    { measure: 'Median score', value: round2(stats.median) },
    { measure: 'Highest score', value: stats.highest },
    { measure: 'Lowest score', value: stats.lowest },
    { measure: 'Generated', value: formatDateTime(new Date(), report.timezone) },
  ]);
  summary.getRow(1).font = { bold: true };
  const grades = new Map<string, number>();
  for (const row of report.rows) grades.set(row.grade, (grades.get(row.grade) ?? 0) + 1);
  if (grades.size) {
    summary.addRow({});
    summary.addRow({ measure: 'Grade', value: 'Students' }).font = { bold: true };
    for (const [grade, count] of [...grades.entries()].sort())
      summary.addRow({ measure: grade, value: count });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/* ------------------------------------------------------------------ */
/* Question paper / answer key                                         */
/* ------------------------------------------------------------------ */

function paperHeading(paper: QuestionPaper, withAnswers: boolean): string[] {
  const minutes = Math.round(paper.durationSeconds / 60);
  return [
    withAnswers ? 'Answer key' : 'Question paper',
    `Duration: ${minutes} minutes  |  Total marks: ${round2(totalMarks(paper))}`,
  ];
}

function sectionNote(section: PaperSection): string {
  return section.selectCount && section.selectCount < section.questions.length
    ? `Question pool: each candidate receives ${section.selectCount} of these ${section.questions.length} questions.`
    : '';
}

export async function questionPaperPdf(
  paper: QuestionPaper,
  withAnswers: boolean,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${paper.examName} - ${withAnswers ? 'Answer key' : 'Question paper'}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(
    pdf,
    font,
    bold,
    [595, 842],
    `${paper.examName} - ${withAnswers ? 'Answer key (confidential)' : 'Question paper'}`,
  );
  const [title, meta] = paperHeading(paper, withAnswers);
  writer.text('BSBE Department', { size: 11, bold: true, color: MUTED });
  writer.text(paper.examName, { size: 17, bold: true, color: BRAND, gap: 2 });
  writer.text(title!, { size: 12, bold: true, gap: 2 });
  writer.text(meta!, { size: 9.5, color: MUTED, gap: 6 });
  if (paper.instructions.trim()) {
    writer.text('Instructions', { size: 10, bold: true });
    writer.text(paper.instructions, { size: 9.5, gap: 4 });
  }
  writer.rule();

  let number = 0;
  for (const section of paper.sections) {
    writer.ensure(60);
    writer.text(section.title, { size: 13, bold: true, color: BRAND, gap: 1 });
    if (section.instructions.trim()) writer.text(section.instructions, { size: 9, color: MUTED });
    const note = sectionNote(section);
    if (note) writer.text(note, { size: 9, color: MUTED });
    writer.y -= 6;
    for (const question of section.questions) {
      number += 1;
      writer.ensure(48);
      writer.text(`Q${number}.  ${question.prompt}`, { size: 10.5, bold: true, gap: 1 });
      writer.text(
        `${questionTypeLabel[question.type] ?? question.type}  |  ${marksLabel(question)}${withAnswers ? `  |  ${question.difficulty}` : ''}`,
        { size: 8.5, color: MUTED, indent: 18, gap: 2 },
      );
      question.options.forEach((option, index) => {
        writer.text(`${optionLabel(index)}.  ${option.text}`, { size: 10, indent: 18 });
      });
      if (question.type === 'true-false' && !question.options.length) {
        writer.text('A.  True', { size: 10, indent: 18 });
        writer.text('B.  False', { size: 10, indent: 18 });
      }
      if (question.type === 'numerical' && !withAnswers)
        writer.text(
          `Answer: ____________${question.numericalUnit ? ` ${question.numericalUnit}` : ''}`,
          {
            size: 10,
            indent: 18,
          },
        );
      if (withAnswers) {
        writer.y -= 2;
        writer.text(`Answer: ${describeAnswer(question)}`, {
          size: 10,
          bold: true,
          indent: 18,
          color: rgb(0.05, 0.42, 0.25),
        });
        if (question.explanation.trim())
          writer.text(`Explanation: ${question.explanation}`, {
            size: 9,
            indent: 18,
            color: MUTED,
          });
      }
      writer.y -= 9;
    }
    writer.rule();
  }
  writer.finish();
  return Buffer.from(await pdf.save());
}

export async function questionPaperDocx(
  paper: QuestionPaper,
  withAnswers: boolean,
): Promise<Buffer> {
  const [title, meta] = paperHeading(paper, withAnswers);
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: 'BSBE Department', bold: true, color: '5F6B7A' })],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: paper.examName })],
    }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: title! })] }),
    new Paragraph({ children: [new TextRun({ text: meta!, color: '5F6B7A', size: 20 })] }),
  ];
  if (paper.instructions.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: 200 },
        children: [new TextRun({ text: 'Instructions', bold: true })],
      }),
      ...paper.instructions
        .split(/\r?\n/)
        .map((line) => new Paragraph({ children: [new TextRun(line)] })),
    );
  }
  let number = 0;
  for (const section of paper.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D1D9E0', space: 4 } },
        children: [new TextRun({ text: section.title })],
      }),
    );
    if (section.instructions.trim())
      children.push(
        new Paragraph({ children: [new TextRun({ text: section.instructions, italics: true })] }),
      );
    const note = sectionNote(section);
    if (note)
      children.push(
        new Paragraph({ children: [new TextRun({ text: note, italics: true, color: '5F6B7A' })] }),
      );
    for (const question of section.questions) {
      number += 1;
      children.push(
        new Paragraph({
          spacing: { before: 240 },
          keepNext: true,
          children: [
            new TextRun({ text: `Q${number}. `, bold: true }),
            new TextRun({ text: question.prompt, bold: true }),
          ],
        }),
        new Paragraph({
          indent: { left: 360 },
          keepNext: true,
          children: [
            new TextRun({
              text: `${questionTypeLabel[question.type] ?? question.type}  |  ${marksLabel(question)}${withAnswers ? `  |  ${question.difficulty}` : ''}`,
              color: '5F6B7A',
              size: 18,
            }),
          ],
        }),
      );
      const options = question.options.length
        ? question.options.map((option) => option.text)
        : question.type === 'true-false'
          ? ['True', 'False']
          : [];
      options.forEach((text, index) =>
        children.push(
          new Paragraph({
            indent: { left: 360 },
            children: [new TextRun(`${optionLabel(index)}.  ${text}`)],
          }),
        ),
      );
      if (question.type === 'numerical' && !withAnswers)
        children.push(
          new Paragraph({
            indent: { left: 360 },
            children: [
              new TextRun(
                `Answer: ____________${question.numericalUnit ? ` ${question.numericalUnit}` : ''}`,
              ),
            ],
          }),
        );
      if (withAnswers) {
        children.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { before: 80 },
            children: [
              new TextRun({ text: 'Answer: ', bold: true, color: '0D6B40' }),
              new TextRun({ text: describeAnswer(question), bold: true, color: '0D6B40' }),
            ],
          }),
        );
        if (question.explanation.trim())
          children.push(
            new Paragraph({
              indent: { left: 360 },
              children: [
                new TextRun({ text: 'Explanation: ', italics: true, color: '5F6B7A' }),
                new TextRun({ text: question.explanation, italics: true, color: '5F6B7A' }),
              ],
            }),
          );
      }
    }
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [new TextRun({ text: '— End of paper —', color: '5F6B7A', size: 18 })],
    }),
  );
  const document = new Document({
    creator: 'BSBE Placement Mock Test Portal',
    title: `${paper.examName} - ${withAnswers ? 'Answer key' : 'Question paper'}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(document);
}
