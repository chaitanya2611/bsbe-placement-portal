// One-off cleanup: permanently deletes ALL examinations and everything tied to them.
//
// Deletes: exams, exam versions, attempts, answers, results, exam-related
// notifications (reminders, schedule changes, cancellations, result-published),
// and question-usage history rows that point at exams.
//
// Keeps: users, sessions, programs, the question bank (questions, versions,
// rubrics, media), audit events, migrations, and admin "announcement" notifications.
//
// Usage (from apps/api, after `pnpm install`):
//   MONGODB_URI="mongodb+srv://..." node scripts/delete-all-exams.mjs            # dry run: counts only
//   MONGODB_URI="mongodb+srv://..." node scripts/delete-all-exams.mjs --confirm  # actually delete
//
// Take a backup first (scripts/backup-mongodb.ps1). This cannot be undone.

import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}
const confirm = process.argv.includes('--confirm');

const EXAM_NOTIFICATION_TYPES = [
  'exam-reminder',
  'schedule-change',
  'exam-cancelled',
  'result-published',
];

const targets = [
  ['results', {}],
  ['answers', {}],
  ['attempts', {}],
  ['examversions', {}],
  ['exams', {}],
  ['notifications', { type: { $in: EXAM_NOTIFICATION_TYPES } }],
  ['questionusages', {}],
];

await mongoose.connect(uri);
const db = mongoose.connection.db;
console.log(`Connected to database "${db.databaseName}".`);

const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

console.log(confirm ? '\nDeleting:' : '\nDry run — would delete:');
for (const [name, filter] of targets) {
  if (!existing.has(name)) {
    console.log(`  ${name.padEnd(16)} (collection not found, skipped)`);
    continue;
  }
  const collection = db.collection(name);
  if (confirm) {
    const { deletedCount } = await collection.deleteMany(filter);
    console.log(`  ${name.padEnd(16)} ${deletedCount} deleted`);
  } else {
    const count = await collection.countDocuments(filter);
    console.log(`  ${name.padEnd(16)} ${count}`);
  }
}

if (!confirm) console.log('\nNothing was deleted. Re-run with --confirm to delete.');
await mongoose.disconnect();
