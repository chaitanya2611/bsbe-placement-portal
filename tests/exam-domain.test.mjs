import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  descriptiveStatistics,
  deterministicOrder,
  gradeFor,
  numericalMatches,
  pointBiserial,
  scoreObjective,
} = require('../apps/api/dist/exams/exam-domain.js');

test('attempt randomization is deterministic per seed and namespace', () => {
  const values = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const first = deterministicOrder(values, 'seed-one', 'questions', (value) => value.id);
  const repeated = deterministicOrder(values, 'seed-one', 'questions', (value) => value.id);
  const another = deterministicOrder(values, 'seed-two', 'questions', (value) => value.id);
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, another);
  assert.deepEqual(
    new Set(first.map((value) => value.id)),
    new Set(values.map((value) => value.id)),
  );
});

test('numerical scoring supports exact, absolute, and relative tolerance', () => {
  assert.equal(numericalMatches(10, 10, 'exact', 0), true);
  assert.equal(numericalMatches(10.09, 10, 'absolute', 0.1), true);
  assert.equal(numericalMatches(109, 100, 'relative', 0.1), true);
  assert.equal(numericalMatches(111, 100, 'relative', 0.1), false);
});

test('objective scoring applies exact-set matching and negative marks', () => {
  assert.deepEqual(
    scoreObjective(
      { type: 'multiple-select', marks: 4, negativeMarks: 1, rubric: { optionIds: ['a', 'c'] } },
      ['c', 'a'],
    ),
    { correct: true, awardedMarks: 4 },
  );
  assert.deepEqual(
    scoreObjective(
      { type: 'multiple-select', marks: 4, negativeMarks: 1, rubric: { optionIds: ['a', 'c'] } },
      ['a'],
    ),
    { correct: false, awardedMarks: -1 },
  );
});

test('grades and descriptive statistics are stable at boundaries', () => {
  const boundaries = [
    { grade: 'A', minimumPercentage: 80 },
    { grade: 'B', minimumPercentage: 60 },
    { grade: 'F', minimumPercentage: 0 },
  ];
  assert.equal(gradeFor(80, boundaries), 'A');
  assert.equal(gradeFor(79.99, boundaries), 'B');
  assert.deepEqual(descriptiveStatistics([1, 2, 3, 4]), {
    sampleSize: 4,
    mean: 2.5,
    median: 2.5,
    standardDeviation: Math.sqrt(1.25),
    minimum: 1,
    maximum: 4,
  });
});

test('item discrimination is hidden for small or zero-variance samples', () => {
  assert.equal(pointBiserial([true, false], [1, 0]), null);
  assert.equal(pointBiserial(Array(10).fill(true), Array(10).fill(5)), null);
});
