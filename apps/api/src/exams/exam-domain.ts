import type { GradeBoundaryRecord } from './exam.models';
import { createHmac } from 'node:crypto';

export interface ScoringQuestion {
  type: 'single-choice' | 'multiple-select' | 'true-false' | 'numerical';
  marks: number;
  negativeMarks: number;
  rubric: unknown;
}

export function deterministicOrder<T>(
  values: readonly T[],
  seed: string,
  namespace: string,
  key: (value: T) => string,
): T[] {
  return [...values].sort((left, right) => {
    const leftHash = createHmac('sha256', seed)
      .update(`${namespace}:${key(left)}`)
      .digest('hex');
    const rightHash = createHmac('sha256', seed)
      .update(`${namespace}:${key(right)}`)
      .digest('hex');
    return leftHash.localeCompare(rightHash);
  });
}

export function numericalMatches(
  actual: number,
  expected: number,
  mode: 'exact' | 'absolute' | 'relative',
  tolerance: number,
): boolean {
  if (!Number.isFinite(actual)) return false;
  if (mode === 'exact') return Object.is(actual, expected) || actual === expected;
  const difference = Math.abs(actual - expected);
  if (mode === 'absolute') return difference <= tolerance;
  return difference <= Math.abs(expected) * tolerance;
}

export function scoreObjective(
  question: ScoringQuestion,
  answer: unknown,
): { correct: boolean; awardedMarks: number } {
  let correct = false;
  if (question.type === 'single-choice') {
    const rubric = question.rubric as { optionId?: unknown };
    correct = typeof answer === 'string' && answer === rubric.optionId;
  } else if (question.type === 'multiple-select') {
    const expected = (question.rubric as { optionIds?: unknown }).optionIds;
    if (Array.isArray(answer) && Array.isArray(expected)) {
      const actualSet = new Set(
        answer.filter((value): value is string => typeof value === 'string'),
      );
      const expectedSet = new Set(
        expected.filter((value): value is string => typeof value === 'string'),
      );
      correct =
        actualSet.size === expectedSet.size &&
        [...actualSet].every((value) => expectedSet.has(value));
    }
  } else if (question.type === 'true-false') {
    correct =
      typeof answer === 'boolean' && answer === (question.rubric as { value?: unknown }).value;
  } else {
    const rubric = question.rubric as {
      value?: unknown;
      toleranceMode?: unknown;
      tolerance?: unknown;
    };
    correct =
      typeof answer === 'number' &&
      typeof rubric.value === 'number' &&
      numericalMatches(
        answer,
        rubric.value,
        rubric.toleranceMode === 'absolute' || rubric.toleranceMode === 'relative'
          ? rubric.toleranceMode
          : 'exact',
        typeof rubric.tolerance === 'number' ? rubric.tolerance : 0,
      );
  }
  return {
    correct,
    awardedMarks: correct
      ? question.marks
      : answer === null || answer === undefined || answer === ''
        ? 0
        : -question.negativeMarks,
  };
}

export function gradeFor(percentage: number, boundaries: readonly GradeBoundaryRecord[]): string {
  return (
    [...boundaries]
      .sort((a, b) => b.minimumPercentage - a.minimumPercentage)
      .find((boundary) => percentage >= boundary.minimumPercentage)?.grade ?? 'F'
  );
}

export function descriptiveStatistics(values: readonly number[]): {
  sampleSize: number;
  mean: number;
  median: number;
  standardDeviation: number;
  minimum: number;
  maximum: number;
} {
  if (!values.length)
    return { sampleSize: 0, mean: 0, median: 0, standardDeviation: 0, minimum: 0, maximum: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    sampleSize: values.length,
    mean,
    median,
    standardDeviation: Math.sqrt(variance),
    minimum: sorted[0]!,
    maximum: sorted.at(-1)!,
  };
}

export function pointBiserial(
  correct: readonly boolean[],
  totals: readonly number[],
): number | null {
  if (correct.length !== totals.length || correct.length < 10) return null;
  const correctTotals = totals.filter((_, index) => correct[index]);
  const incorrectTotals = totals.filter((_, index) => !correct[index]);
  if (!correctTotals.length || !incorrectTotals.length) return null;
  const stats = descriptiveStatistics(totals);
  if (stats.standardDeviation === 0) return null;
  const meanCorrect = descriptiveStatistics(correctTotals).mean;
  const meanIncorrect = descriptiveStatistics(incorrectTotals).mean;
  const p = correctTotals.length / totals.length;
  return ((meanCorrect - meanIncorrect) / stats.standardDeviation) * Math.sqrt(p * (1 - p));
}
