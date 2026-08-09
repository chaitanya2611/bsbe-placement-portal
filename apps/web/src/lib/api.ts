import type {
  AccountSummary,
  AdminResultSummary,
  AttemptView,
  ExamInput,
  ExamSummary,
  IntegrityEventInput,
  MediaAsset,
  OtpRequestResponse,
  Program,
  QuestionDefinition,
  QuestionDifficulty,
  QuestionStatus,
  QuestionSummary,
  QuestionType,
  SafeQuestionVersion,
  SaveAnswerInput,
  SessionSummary,
  StudentExam,
  ResultView,
  UserRole,
} from '@bsbe/contracts';
import { webEnvironment } from './environment';

interface ApiFailureBody {
  code?: string;
  message?: string;
}

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken: string | undefined;

async function loadCsrf(): Promise<string> {
  const response = await fetch(`${webEnvironment.VITE_API_BASE_URL}/auth/csrf`, {
    credentials: 'include',
  });
  if (!response.ok)
    throw new ApiFailure(
      response.status,
      'CSRF_UNAVAILABLE',
      'Could not initialize security token',
    );
  const body = (await response.json()) as { csrfToken: string };
  csrfToken = body.csrfToken;
  return csrfToken;
}

async function api<T>(path: string, init: RequestInit = {}, retryCsrf = true): Promise<T> {
  const method = init.method?.toUpperCase() ?? 'GET';
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const token = mutation ? (csrfToken ?? (await loadCsrf())) : undefined;
  const isFormData = init.body instanceof FormData;
  const response = await fetch(`${webEnvironment.VITE_API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body && !isFormData ? { 'content-type': 'application/json' } : {}),
      ...(token ? { 'x-csrf-token': token } : {}),
      ...init.headers,
    },
  });
  if (response.status === 403 && mutation && retryCsrf) {
    await loadCsrf();
    return api<T>(path, init, false);
  }
  if (!response.ok) {
    const body = (await response
      .text()
      .then((text) => {
        if (!text.trim()) return {};
        return JSON.parse(text) as ApiFailureBody;
      })
      .catch(() => ({}))) as ApiFailureBody;
    const fallbackMessage =
      body.code === 'RECENT_AUTHENTICATION_REQUIRED'
        ? 'Your administrator verification has expired. Sign out and sign in again to continue.'
        : body.code === 'AUTHENTICATION_REQUIRED'
          ? 'Your secure session has expired. Sign in again to continue.'
          : 'Request failed';
    throw new ApiFailure(
      response.status,
      body.code ?? 'REQUEST_FAILED',
      body.message ?? fallbackMessage,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const identityApi = {
  session: () => api<SessionSummary>('/auth/session'),
  requestOtp: (email: string) =>
    api<OtpRequestResponse>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  verifyOtp: (challengeId: string, otp: string) =>
    api<SessionSummary>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, otp }),
    }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  programs: () => api<Program[]>('/admin/programs'),
  createProgram: (code: string, name: string) =>
    api<Program>('/admin/programs', { method: 'POST', body: JSON.stringify({ code, name }) }),
  users: (search = '') =>
    api<AccountSummary[]>(`/admin/users?limit=100&search=${encodeURIComponent(search)}`),
  createUser: (input: {
    email: string;
    fullName: string;
    role: UserRole;
    rollNumber?: string;
    programId?: string;
  }) => api<AccountSummary>('/admin/users', { method: 'POST', body: JSON.stringify(input) }),
  updateUserStatus: (userId: string, status: 'active' | 'inactive', reason: string) =>
    api<AccountSummary>(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }),
  questions: (filters: {
    search?: string;
    type?: QuestionType | '';
    difficulty?: QuestionDifficulty | '';
    status?: QuestionStatus | '';
    tag?: string;
  }) => {
    const query = new URLSearchParams({ limit: '100' });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    return api<QuestionSummary[]>(`/admin/questions?${query.toString()}`);
  },
  question: (questionId: string) => api<SafeQuestionVersion>(`/admin/questions/${questionId}`),
  questionHistory: (questionId: string) =>
    api<{
      versions: Array<{ id: string; version: number; createdAt: string }>;
      usage: Array<{
        examId: string;
        examVersionId: string;
        questionVersion: number;
        recordedAt: string;
      }>;
    }>(`/admin/questions/${questionId}/history`),
  createQuestion: (definition: QuestionDefinition) =>
    api<SafeQuestionVersion>('/admin/questions', {
      method: 'POST',
      body: JSON.stringify(definition),
    }),
  updateQuestion: (questionId: string, expectedVersion: number, definition: QuestionDefinition) =>
    api<SafeQuestionVersion>(`/admin/questions/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify({ expectedVersion, definition }),
    }),
  deleteQuestion: (questionId: string) =>
    api<void>(`/admin/questions/${questionId}`, { method: 'DELETE' }),
  revealRubric: (questionId: string) =>
    api<{ questionId: string; questionVersionId: string; version: number; answer: unknown }>(
      `/admin/questions/${questionId}/rubric`,
    ),
  media: () => api<MediaAsset[]>('/admin/media?limit=100'),
  uploadMedia: (file: File) => {
    const body = new FormData();
    body.set('file', file);
    return api<MediaAsset>('/admin/media', { method: 'POST', body });
  },
  mediaContentUrl: (mediaId: string) =>
    `${webEnvironment.VITE_API_BASE_URL}/admin/media/${mediaId}/content`,
  exams: () => api<ExamSummary[]>('/admin/exams'),
  createExam: (input: ExamInput) =>
    api<ExamSummary>('/admin/exams', { method: 'POST', body: JSON.stringify(input) }),
  updateExam: (examId: string, input: ExamInput) =>
    api<ExamSummary>(`/admin/exams/${examId}`, { method: 'PUT', body: JSON.stringify(input) }),
  setExamStatus: (examId: string, status: 'published' | 'cancelled' | 'archived', reason: string) =>
    api<ExamSummary>(`/admin/exams/${examId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }),
  liveAttempts: (examId: string) => api<unknown[]>(`/admin/exams/${examId}/live`),
  analytics: (examId: string) => api<Record<string, unknown>>(`/admin/exams/${examId}/analytics`),
  adminResults: (examId: string) => api<AdminResultSummary[]>(`/admin/exams/${examId}/results`),
  publishResults: (examId: string, published: boolean, reason: string) =>
    api<{ updated: number }>(`/admin/exams/${examId}/results`, {
      method: 'PATCH',
      body: JSON.stringify({ published, reason }),
    }),
  attendanceCsvUrl: (examId: string) =>
    `${webEnvironment.VITE_API_BASE_URL}/admin/exams/${examId}/attendance.csv`,
  attendanceXlsxUrl: (examId: string) =>
    `${webEnvironment.VITE_API_BASE_URL}/admin/exams/${examId}/attendance.xlsx`,
  attendancePdfUrl: (examId: string) =>
    `${webEnvironment.VITE_API_BASE_URL}/admin/exams/${examId}/attendance.pdf`,
  studentExams: () => api<StudentExam[]>('/student/exams'),
  authorizeExam: (examId: string, password: string, standardBrowserFallback: boolean) =>
    api<{ authorizationToken: string; expiresInSeconds: number }>(
      `/student/exams/${examId}/authorize`,
      { method: 'POST', body: JSON.stringify({ password, standardBrowserFallback }) },
    ),
  startAttempt: (examId: string, authorizationToken: string, idempotencyKey: string) =>
    api<AttemptView>(`/student/exams/${examId}/start`, {
      method: 'POST',
      body: JSON.stringify({ authorizationToken, idempotencyKey }),
    }),
  attempt: (attemptId: string) => api<AttemptView>(`/student/attempts/${attemptId}`),
  attemptMediaUrl: (attemptId: string, mediaId: string) =>
    `${webEnvironment.VITE_API_BASE_URL}/student/attempts/${attemptId}/media/${mediaId}`,
  activeAttempt: () => api<AttemptView | null>('/student/attempts-active/current'),
  saveAnswers: (attemptId: string, answers: SaveAnswerInput[]) =>
    api<{
      revision: number;
      saved: Array<{ questionInstanceId: string; sequence: number; serverReceivedAt: string }>;
    }>(`/student/attempts/${attemptId}/answers`, { method: 'PUT', body: JSON.stringify(answers) }),
  heartbeat: (attemptId: string) =>
    api<{
      serverTime: string;
      endsAt: string;
      sectionEndsAt: string;
      offlineLeaseExpiresAt: string;
      status: string;
    }>(`/student/attempts/${attemptId}/heartbeat`, { method: 'POST' }),
  transitionSection: (attemptId: string, nextSectionIndex: number) =>
    api<AttemptView>(`/student/attempts/${attemptId}/section`, {
      method: 'POST',
      body: JSON.stringify({ nextSectionIndex }),
    }),
  integrityEvent: (attemptId: string, event: IntegrityEventInput) =>
    api<void>(`/student/attempts/${attemptId}/integrity`, {
      method: 'POST',
      body: JSON.stringify(event),
    }),
  submitAttempt: (attemptId: string, idempotencyKey: string) =>
    api<{ resultId: string; status: string }>(`/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
  results: () => api<ResultView[]>('/student/results'),
  marksheetUrl: (resultId: string) =>
    `${webEnvironment.VITE_API_BASE_URL}/student/results/${resultId}/marksheet.pdf`,
  notifications: () =>
    api<
      Array<{ publicId: string; title: string; message: string; status: string; createdAt: string }>
    >('/student/notifications'),
};
