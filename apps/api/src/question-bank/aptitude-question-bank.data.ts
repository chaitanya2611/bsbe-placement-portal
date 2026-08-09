import type { QuestionDefinition, QuestionDifficulty } from '@bsbe/contracts';

export interface AptitudeQuestionSeed {
  code: string;
  definition: QuestionDefinition;
}

type OptionId = 'A' | 'B' | 'C' | 'D';

interface SingleChoiceSeedInput {
  code: string;
  prompt: string;
  options: [string, string, string, string];
  answer: OptionId;
  marks: number;
  negativeMarks: number;
  difficulty: QuestionDifficulty;
  tag: string;
  explanation: string;
}

const optionIds: OptionId[] = ['A', 'B', 'C', 'D'];

function singleChoice(input: SingleChoiceSeedInput): AptitudeQuestionSeed {
  return {
    code: input.code,
    definition: {
      type: 'single-choice',
      prompt: input.prompt,
      options: input.options.map((text, index) => ({ id: optionIds[index]!, text })),
      answer: { optionId: input.answer },
      marks: input.marks,
      negativeMarks: input.negativeMarks,
      difficulty: input.difficulty,
      tags: [input.tag, 'aptitude', input.code],
      explanation: input.explanation,
      mediaIds: [],
    },
  };
}

export const aptitudeQuestionBank: AptitudeQuestionSeed[] = [
  singleChoice({
    code: 'aptitude-q01',
    prompt: 'If a train 120 meters long crosses a pole in 8 seconds, what is its speed in km/hr?',
    options: ['48 km/hr', '54 km/hr', '45 km/hr', '50 km/hr'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'speed-distance',
    explanation: 'Speed = 120/8 = 15 m/s = 15 x 3.6 = 54 km/hr.',
  }),
  singleChoice({
    code: 'aptitude-q02',
    prompt:
      'A sum of money doubles itself in 8 years at simple interest. What is the rate of interest per annum?',
    options: ['10%', '12.5%', '8%', '15%'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'simple-interest',
    explanation: 'A 100% increase over 8 years means the rate is 100/8 = 12.5% per annum.',
  }),
  singleChoice({
    code: 'aptitude-q03',
    prompt: 'The average of five consecutive odd numbers is 61. What is the largest number?',
    options: ['63', '67', '65', '69'],
    answer: 'C',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'averages',
    explanation: 'The numbers are 57, 59, 61, 63, and 65; the largest is 65.',
  }),
  singleChoice({
    code: 'aptitude-q04',
    prompt:
      'A can complete a work in 12 days and B can complete it in 18 days. Working together, in how many days will they complete the work?',
    options: ['7.2 days', '8 days', '6.5 days', '9 days'],
    answer: 'A',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'time-work',
    explanation: 'Combined rate = 1/12 + 1/18 = 5/36, so time = 36/5 = 7.2 days.',
  }),
  singleChoice({
    code: 'aptitude-q05',
    prompt: 'If the ratio of two numbers is 3:5 and their sum is 96, find the larger number.',
    options: ['36', '48', '60', '72'],
    answer: 'C',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'ratio',
    explanation: '3x + 5x = 96, so x = 12 and the larger number is 5x = 60.',
  }),
  singleChoice({
    code: 'aptitude-q06',
    prompt: 'What is 15% of 240?',
    options: ['32', '36', '40', '42'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'percentage',
    explanation: '15% of 240 = 0.15 x 240 = 36.',
  }),
  singleChoice({
    code: 'aptitude-q07',
    prompt:
      'A shopkeeper marks an item 25% above cost price and gives a discount of 10%. What is his profit percentage?',
    options: ['10%', '12.5%', '15%', '20%'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'profit-loss',
    explanation: 'CP = 100, MP = 125, SP = 125 x 0.9 = 112.5, so profit = 12.5%.',
  }),
  singleChoice({
    code: 'aptitude-q08',
    prompt: 'Find the next number in the series: 2, 6, 12, 20, 30, ?',
    options: ['40', '42', '44', '36'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'number-series',
    explanation: 'Differences increase by 2 (4, 6, 8, 10, 12); the next term is 30 + 12 = 42.',
  }),
  singleChoice({
    code: 'aptitude-q09',
    prompt: 'Find the odd one out: 8, 27, 64, 100, 125',
    options: ['27', '64', '100', '125'],
    answer: 'C',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'classification',
    explanation: 'All the other numbers are perfect cubes (2, 3, 4, and 5 cubed); 100 is not.',
  }),
  singleChoice({
    code: 'aptitude-q10',
    prompt:
      'A boat goes 30 km downstream in 2 hours and returns upstream in 3 hours. Find the speed of the boat in still water.',
    options: ['10 km/hr', '11 km/hr', '12.5 km/hr', '13 km/hr'],
    answer: 'C',
    marks: 2,
    negativeMarks: 0.5,
    difficulty: 'hard',
    tag: 'boats-streams',
    explanation:
      'Downstream speed = 15 km/hr and upstream speed = 10 km/hr, so boat speed = (15 + 10)/2 = 12.5 km/hr.',
  }),
  singleChoice({
    code: 'aptitude-q11',
    prompt: 'If CODING is written as DPEJOH, how is FLYING written in the same code?',
    options: ['GMZJOH', 'GMZJPH', 'GNZJOH', 'GMYJOH'],
    answer: 'A',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'coding-decoding',
    explanation: 'Each letter is shifted forward by one position in the alphabet.',
  }),
  singleChoice({
    code: 'aptitude-q12',
    prompt:
      "Pointing to a photograph, a man says, 'She is the daughter of my grandfather's only son.' How is the woman related to the man?",
    options: ['Mother', 'Sister', 'Daughter', 'Aunt'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'blood-relations',
    explanation: "The grandfather's only son is the man's father, so the daughter is his sister.",
  }),
  singleChoice({
    code: 'aptitude-q13',
    prompt: 'Find the missing number: 5, 11, 23, 47, ?',
    options: ['89', '92', '95', '98'],
    answer: 'C',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'number-series',
    explanation: 'Each term follows (previous x 2) + 1; therefore 47 x 2 + 1 = 95.',
  }),
  singleChoice({
    code: 'aptitude-q14',
    prompt:
      'A is twice as fast as B. If B can complete a task in 30 days, in how many days can A and B together complete it?',
    options: ['8 days', '10 days', '12 days', '15 days'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'time-work',
    explanation: "A's rate = 1/15 and B's rate = 1/30; combined rate = 1/10, so time = 10 days.",
  }),
  singleChoice({
    code: 'aptitude-q15',
    prompt: 'What is the probability of getting a sum of 9 when two dice are rolled?',
    options: ['1/6', '1/9', '1/12', '1/4'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'probability',
    explanation: 'There are 4 favorable outcomes out of 36 total outcomes, giving 4/36 = 1/9.',
  }),
  singleChoice({
    code: 'aptitude-q16',
    prompt:
      'A sum invested at compound interest amounts to Rs. 4,840 in 2 years and Rs. 5,324 in 3 years at the same rate. What is the rate of interest?',
    options: ['8%', '9%', '10%', '12%'],
    answer: 'C',
    marks: 2,
    negativeMarks: 0.5,
    difficulty: 'hard',
    tag: 'compound-interest',
    explanation: '5324/4840 = 1.10, so the rate of interest is 10%.',
  }),
  singleChoice({
    code: 'aptitude-q17',
    prompt: 'In a certain code, TABLE is written as UBCMF. How is CHAIR written in the same code?',
    options: ['DIBJS', 'DIBIS', 'DHBJS', 'DIBJT'],
    answer: 'A',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'coding-decoding',
    explanation: 'Each letter is shifted forward by one position in the alphabet.',
  }),
  singleChoice({
    code: 'aptitude-q18',
    prompt: 'If today is Wednesday, what day will it be after 90 days?',
    options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'calendars',
    explanation: '90 mod 7 = 6; Wednesday + 6 days = Tuesday.',
  }),
  singleChoice({
    code: 'aptitude-q19',
    prompt:
      "A father is 4 times as old as his son. After 5 years, he will be 3 times as old. Find the son's current age.",
    options: ['8 years', '10 years', '12 years', '15 years'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'ages',
    explanation: '4x + 5 = 3(x + 5), giving x = 10.',
  }),
  singleChoice({
    code: 'aptitude-q20',
    prompt: 'Find the value of x: 3x - 7 = 2x + 5',
    options: ['10', '11', '12', '13'],
    answer: 'C',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'algebra',
    explanation: '3x - 2x = 5 + 7, so x = 12.',
  }),
  singleChoice({
    code: 'aptitude-q21',
    prompt:
      'A alone can do a piece of work in 10 days, and B alone in 15 days. They work together for 3 days, and then A leaves. In how many days will B finish the remaining work?',
    options: ['5 days', '6 days', '7.5 days', '9 days'],
    answer: 'C',
    marks: 2,
    negativeMarks: 0.5,
    difficulty: 'hard',
    tag: 'time-work',
    explanation:
      "Combined rate = 1/6; in 3 days half the work is done. The remaining half at B's rate of 1/15 takes 7.5 days.",
  }),
  singleChoice({
    code: 'aptitude-q22',
    prompt:
      'The perimeter of a rectangle is 60 cm, and its length is twice its breadth. Find its area.',
    options: ['150 cm2', '180 cm2', '200 cm2', '220 cm2'],
    answer: 'C',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'medium',
    tag: 'mensuration',
    explanation: 'l + b = 30 and l = 2b, giving b = 10 and l = 20; area = 200 cm2.',
  }),
  singleChoice({
    code: 'aptitude-q23',
    prompt:
      'Statement: All pens are pencils. All pencils are erasers. Conclusion: All pens are erasers. Is the conclusion valid?',
    options: ['True', 'False', 'Cannot be determined', 'None of these'],
    answer: 'A',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'logical-reasoning',
    explanation: 'By syllogism, the conclusion logically follows from the statements.',
  }),
  singleChoice({
    code: 'aptitude-q24',
    prompt:
      'A man walks at a speed of 5 km/hr and reaches his office 6 minutes late. If he walks at 6 km/hr, he reaches 2 minutes early. Find the distance to his office.',
    options: ['3 km', '4 km', '5 km', '6 km'],
    answer: 'B',
    marks: 2,
    negativeMarks: 0.5,
    difficulty: 'hard',
    tag: 'speed-distance',
    explanation: 'The time difference is 8 minutes; solving d(1/5 - 1/6) = 8/60 gives d = 4 km.',
  }),
  singleChoice({
    code: 'aptitude-q25',
    prompt: 'Which number should replace the question mark? 7, 14, 28, 56, ?',
    options: ['98', '100', '112', '120'],
    answer: 'C',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'number-series',
    explanation: 'Each term doubles the previous one; 56 x 2 = 112.',
  }),
  singleChoice({
    code: 'aptitude-q26',
    prompt:
      'If 6 men can complete a job in 12 days, how many days will 8 men take to complete the same job?',
    options: ['8 days', '9 days', '10 days', '11 days'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'time-work',
    explanation: 'Total work = 6 x 12 = 72 man-days; 72/8 = 9 days.',
  }),
  singleChoice({
    code: 'aptitude-q27',
    prompt:
      'A person spends 75% of his income. If his income increases by 20% and expenditure increases by 10%, find the percentage increase in his savings.',
    options: ['40%', '45%', '50%', '60%'],
    answer: 'C',
    marks: 2,
    negativeMarks: 0.5,
    difficulty: 'hard',
    tag: 'percentage',
    explanation: 'Savings rise from 25 to 37.5, which is a 50% increase.',
  }),
  singleChoice({
    code: 'aptitude-q28',
    prompt: 'Find the odd one out: Apple, Banana, Carrot, Mango, Grapes',
    options: ['Banana', 'Carrot', 'Mango', 'Grapes'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'classification',
    explanation: 'Carrot is a vegetable while the rest are fruits.',
  }),
  singleChoice({
    code: 'aptitude-q29',
    prompt: 'A dice is thrown once. What is the probability of getting a number greater than 4?',
    options: ['1/2', '1/3', '1/6', '2/3'],
    answer: 'B',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'probability',
    explanation: 'Numbers greater than 4 are 5 and 6, so the probability is 2/6 = 1/3.',
  }),
  singleChoice({
    code: 'aptitude-q30',
    prompt: 'The sum of three consecutive integers is 72. What is the largest integer?',
    options: ['23', '24', '25', '26'],
    answer: 'C',
    marks: 1,
    negativeMarks: 0.25,
    difficulty: 'easy',
    tag: 'number-system',
    explanation: 'x + (x + 1) + (x + 2) = 72 gives x = 23; the largest integer is 25.',
  }),
];
