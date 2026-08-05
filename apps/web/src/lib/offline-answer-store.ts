import type { SaveAnswerInput } from '@bsbe/contracts';

const databaseName = 'bsbe-exam-offline';
const storeName = 'pending-answers';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName))
        db.createObjectStore(storeName, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline database could not open'));
  });
}

export async function queueAnswer(attemptId: string, answer: SaveAnswerInput): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction
      .objectStore(storeName)
      .put({ key: `${attemptId}:${answer.questionInstanceId}`, attemptId, answer });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Offline answer could not be queued'));
  });
  db.close();
}

export async function pendingAnswers(attemptId: string): Promise<SaveAnswerInput[]> {
  const db = await database();
  const rows = await new Promise<Array<{ attemptId: string; answer: SaveAnswerInput }>>(
    (resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () =>
        resolve(request.result as Array<{ attemptId: string; answer: SaveAnswerInput }>);
      request.onerror = () =>
        reject(request.error ?? new Error('Offline answers could not be read'));
    },
  );
  db.close();
  return rows.filter((row) => row.attemptId === attemptId).map((row) => row.answer);
}

export async function clearPending(
  attemptId: string,
  questionInstanceIds: string[],
): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    for (const id of questionInstanceIds)
      transaction.objectStore(storeName).delete(`${attemptId}:${id}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Offline answers could not be cleared'));
  });
  db.close();
}
