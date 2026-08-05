import type {
  AttemptView,
  ExamInput,
  ExamSummary,
  Program,
  QuestionSummary,
  ResultView,
  SaveAnswerInput,
  SessionSummary,
  StudentExam,
} from '@bsbe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { identityApi } from '../lib/api';
import { clearPending, pendingAnswers, queueAnswer } from '../lib/offline-answer-store';
import { ChemicalPreview, RichText } from './question-bank';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The operation could not be completed.';
}
function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
function localDate(value: Date): string {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}
function remaining(target: string, now: number): string {
  const seconds = Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

interface SectionDraft {
  id: string;
  title: string;
  instructions: string;
  durationMinutes: number;
  selectCount: number;
  questionIds: string[];
}

export function AdminExamWorkspace(): ReactElement {
  const client = useQueryClient();
  const exams = useQuery({ queryKey: ['exams'], queryFn: identityApi.exams });
  const programs = useQuery({ queryKey: ['programs'], queryFn: identityApi.programs });
  const questions = useQuery({
    queryKey: ['questions', 'exam-builder'],
    queryFn: () => identityApi.questions({ status: 'active' }),
  });
  const [sections, setSections] = useState<SectionDraft[]>([
    {
      id: crypto.randomUUID(),
      title: 'Section 1',
      instructions: '',
      durationMinutes: 30,
      selectCount: 1,
      questionIds: [],
    },
  ]);
  const [selectedExam, setSelectedExam] = useState<ExamSummary>();
  const live = useQuery({
    queryKey: ['live-attempts', selectedExam?.id],
    queryFn: () => identityApi.liveAttempts(selectedExam!.id),
    enabled: Boolean(selectedExam),
  });
  const analytics = useQuery({
    queryKey: ['analytics', selectedExam?.id],
    queryFn: () => identityApi.analytics(selectedExam!.id),
    enabled: Boolean(selectedExam),
  });
  const create = useMutation({
    mutationFn: identityApi.createExam,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['exams'] });
    },
  });
  const status = useMutation({
    mutationFn: ({
      examId,
      next,
    }: {
      examId: string;
      next: 'published' | 'cancelled' | 'archived';
    }) =>
      identityApi.setExamStatus(
        examId,
        next,
        window.prompt('Reason for this audited action')?.trim() ||
          'Administrative lifecycle action',
      ),
    onSuccess: async () => client.invalidateQueries({ queryKey: ['exams'] }),
  });
  const results = useMutation({
    mutationFn: ({ examId, published }: { examId: string; published: boolean }) =>
      identityApi.publishResults(examId, published, 'Administrator publication decision'),
  });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startAt = new Date(formText(form, 'startAt'));
    const endEntryAt = new Date(formText(form, 'endEntryAt'));
    const allowedProgramIds = form
      .getAll('programs')
      .filter((value): value is string => typeof value === 'string');
    const input: ExamInput = {
      name: formText(form, 'name'),
      description: formText(form, 'description'),
      instructions: formText(form, 'instructions'),
      allowedProgramIds,
      startAt: startAt.toISOString(),
      endEntryAt: endEntryAt.toISOString(),
      durationSeconds: Number(formText(form, 'durationMinutes')) * 60,
      timezone: 'Asia/Kolkata',
      password: formText(form, 'password'),
      lockdownRequired: form.get('lockdownRequired') === 'on',
      allowStandardBrowserFallback: form.get('fallback') === 'on',
      sebConfigKeys: formText(form, 'sebConfigKeys').split(/\s+/).filter(Boolean),
      ...(formText(form, 'sebConfigurationUrl').trim()
        ? { sebConfigurationUrl: formText(form, 'sebConfigurationUrl').trim() }
        : {}),
      showQuestionReview: form.get('showReview') === 'on',
      showCorrectAnswers: form.get('showAnswers') === 'on',
      gradeBoundaries: [
        { grade: 'A', minimumPercentage: 80 },
        { grade: 'B', minimumPercentage: 65 },
        { grade: 'C', minimumPercentage: 50 },
        { grade: 'D', minimumPercentage: 40 },
        { grade: 'F', minimumPercentage: 0 },
      ],
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        instructions: section.instructions,
        durationSeconds: section.durationMinutes * 60,
        questionIds: section.questionIds,
        selectCount: section.selectCount,
        randomQuestionOrder: true,
        randomOptionOrder: true,
        navigation: 'free',
      })),
    };
    create.mutate(input);
  };
  const tomorrow = new Date(Date.now() + 86_400_000);
  return (
    <div className="exam-admin-grid">
      <section className="panel exam-builder">
        <p className="eyebrow">Exam builder</p>
        <h2>Create scheduled examination</h2>
        <form onSubmit={submit} className="stack-form">
          <label>
            Exam name
            <input name="name" required minLength={3} />
          </label>
          <label>
            Description
            <textarea name="description" rows={2} />
          </label>
          <label>
            Candidate instructions
            <textarea name="instructions" rows={4} required />
          </label>
          <div className="form-row">
            <label>
              Starts at
              <input
                name="startAt"
                type="datetime-local"
                defaultValue={localDate(tomorrow)}
                required
              />
            </label>
            <label>
              Entry closes
              <input
                name="endEntryAt"
                type="datetime-local"
                defaultValue={localDate(new Date(tomorrow.getTime() + 30 * 60_000))}
                required
              />
            </label>
            <label>
              Total minutes
              <input name="durationMinutes" type="number" min={5} defaultValue={60} required />
            </label>
          </div>
          <fieldset>
            <legend>Eligible programs</legend>
            {programs.data?.map((program: Program) => (
              <label className="check-row" key={program.id}>
                <input type="checkbox" name="programs" value={program.id} />
                {program.name}
              </label>
            ))}
          </fieldset>
          <label>
            Exam access password
            <input name="password" type="password" minLength={6} required />
          </label>
          <div className="form-row">
            <label className="check-row">
              <input name="lockdownRequired" type="checkbox" />
              Require Safe Exam Browser
            </label>
            <label className="check-row">
              <input name="fallback" type="checkbox" defaultChecked />
              Allow audited standard-browser fallback
            </label>
          </div>
          <label>
            SEB Config Keys (one 64-character key per line)
            <textarea name="sebConfigKeys" rows={2} />
          </label>
          <label>
            Safe Exam Browser configuration URL (optional)
            <input name="sebConfigurationUrl" type="url" placeholder="https://…/exam.seb" />
          </label>
          <div className="form-row">
            <label className="check-row">
              <input name="showReview" type="checkbox" />
              Show question-wise performance
            </label>
            <label className="check-row">
              <input name="showAnswers" type="checkbox" />
              Show correct answers after publication
            </label>
          </div>
          <div className="section-builder">
            <div className="section-builder-heading">
              <h3>Timed sections</h3>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setSections((items) => [
                    ...items,
                    {
                      id: crypto.randomUUID(),
                      title: `Section ${items.length + 1}`,
                      instructions: '',
                      durationMinutes: 30,
                      selectCount: 1,
                      questionIds: [],
                    },
                  ])
                }
              >
                Add section
              </button>
            </div>
            {sections.map((section, index) => (
              <fieldset key={section.id}>
                <legend>Section {index + 1}</legend>
                <div className="form-row">
                  <label>
                    Title
                    <input
                      value={section.title}
                      onChange={(event) =>
                        setSections((items) =>
                          items.map((item) =>
                            item.id === section.id ? { ...item, title: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Minutes
                    <input
                      type="number"
                      min={1}
                      value={section.durationMinutes}
                      onChange={(event) =>
                        setSections((items) =>
                          items.map((item) =>
                            item.id === section.id
                              ? { ...item, durationMinutes: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Questions selected
                    <input
                      type="number"
                      min={1}
                      value={section.selectCount}
                      onChange={(event) =>
                        setSections((items) =>
                          items.map((item) =>
                            item.id === section.id
                              ? { ...item, selectCount: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  Instructions
                  <textarea
                    value={section.instructions}
                    onChange={(event) =>
                      setSections((items) =>
                        items.map((item) =>
                          item.id === section.id
                            ? { ...item, instructions: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Question pool
                  <select
                    multiple
                    size={Math.min(8, Math.max(3, questions.data?.length ?? 3))}
                    value={section.questionIds}
                    onChange={(event) => {
                      const values = [...event.currentTarget.selectedOptions].map(
                        (option) => option.value,
                      );
                      setSections((items) =>
                        items.map((item) =>
                          item.id === section.id ? { ...item, questionIds: values } : item,
                        ),
                      );
                    }}
                  >
                    {questions.data?.map((question: QuestionSummary) => (
                      <option value={question.id} key={question.id}>
                        {question.promptSummary} · {question.marks} marks
                      </option>
                    ))}
                  </select>
                </label>
                {sections.length > 1 ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() =>
                      setSections((items) => items.filter((item) => item.id !== section.id))
                    }
                  >
                    Remove section
                  </button>
                ) : null}
              </fieldset>
            ))}
          </div>
          {create.error ? <p className="form-error">{message(create.error)}</p> : null}
          <button className="primary-button" disabled={create.isPending}>
            Save exam draft
          </button>
        </form>
      </section>
      <section className="exam-operations">
        <div className="panel">
          <p className="eyebrow">Schedule and control</p>
          <h2>Examinations</h2>
          <div className="exam-card-list">
            {exams.data?.map((exam) => (
              <article
                className={`exam-card ${selectedExam?.id === exam.id ? 'exam-card--selected' : ''}`}
                key={exam.id}
              >
                <button className="card-selector" onClick={() => setSelectedExam(exam)}>
                  <strong>{exam.name}</strong>
                  <span>
                    {new Date(exam.startAt).toLocaleString()} ·{' '}
                    {Math.round(exam.durationSeconds / 60)} min
                  </span>
                  <span className={`status status--${exam.status}`}>{exam.status}</span>
                </button>
                <div className="exam-card-actions">
                  {exam.status === 'draft' ? (
                    <button onClick={() => status.mutate({ examId: exam.id, next: 'published' })}>
                      Publish
                    </button>
                  ) : null}
                  {exam.status === 'published' ? (
                    <>
                      <button onClick={() => results.mutate({ examId: exam.id, published: true })}>
                        Publish results
                      </button>
                      <button onClick={() => status.mutate({ examId: exam.id, next: 'cancelled' })}>
                        Cancel
                      </button>
                    </>
                  ) : null}
                  <a href={identityApi.attendanceCsvUrl(exam.id)} target="_blank" rel="noreferrer">
                    Attendance CSV
                  </a>
                  <a href={identityApi.attendanceXlsxUrl(exam.id)} target="_blank" rel="noreferrer">
                    XLSX
                  </a>
                  <a href={identityApi.attendancePdfUrl(exam.id)} target="_blank" rel="noreferrer">
                    PDF
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
        {selectedExam ? (
          <div className="panel live-panel">
            <p className="eyebrow">Live operations</p>
            <h2>{selectedExam.name}</h2>
            <h3>Attempts</h3>
            <pre>{JSON.stringify(live.data ?? [], null, 2)}</pre>
            <h3>Analytics</h3>
            <pre>{JSON.stringify(analytics.data ?? {}, null, 2)}</pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function StudentExamWorkspace({ session }: { session: SessionSummary }): ReactElement {
  const client = useQueryClient();
  const active = useQuery({
    queryKey: ['active-attempt'],
    queryFn: identityApi.activeAttempt,
    refetchOnWindowFocus: false,
  });
  const schedule = useQuery({ queryKey: ['student-exams'], queryFn: identityApi.studentExams });
  const results = useQuery({ queryKey: ['student-results'], queryFn: identityApi.results });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: identityApi.notifications,
  });
  const [selected, setSelected] = useState<StudentExam>();
  const [password, setPassword] = useState('');
  const [fallback, setFallback] = useState(true);
  const [systemCheck, setSystemCheck] = useState<string>();
  const enter = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select an examination');
      if (window.matchMedia('(max-width: 767px)').matches)
        throw new Error('Examinations require a supported laptop or desktop display.');
      const authorization = await identityApi.authorizeExam(selected.id, password, fallback);
      return identityApi.startAttempt(
        selected.id,
        authorization.authorizationToken,
        crypto.randomUUID(),
      );
    },
    onSuccess: (attempt) => {
      client.setQueryData(['active-attempt'], attempt);
      setSelected(undefined);
    },
  });
  if (active.data)
    return (
      <ExamRunner
        initial={active.data}
        session={session}
        onFinished={async () => {
          client.setQueryData(['active-attempt'], null);
          await Promise.all([
            client.invalidateQueries({ queryKey: ['student-exams'] }),
            client.invalidateQueries({ queryKey: ['student-results'] }),
          ]);
        }}
      />
    );
  return (
    <div className="student-dashboard-grid">
      <section className="student-main">
        <div className="panel dashboard-hero">
          <p className="eyebrow">Candidate dashboard</p>
          <h2>Examinations</h2>
          <p>
            All times are controlled by the server. Complete the system check before a secure
            examination.
          </p>
          <button
            className="secondary-button"
            onClick={() => {
              const checks = [
                navigator.onLine ? 'network online' : 'network offline',
                window.indexedDB ? 'recovery storage available' : 'recovery storage unavailable',
                document.fullscreenEnabled ? 'fullscreen available' : 'fullscreen unavailable',
                window.innerWidth >= 768 ? 'display supported' : 'display too small',
              ];
              setSystemCheck(checks.join(' · '));
              if (document.fullscreenEnabled) void document.documentElement.requestFullscreen();
            }}
          >
            Run fullscreen system check
          </button>
          {systemCheck ? <p className="system-check-result">{systemCheck}</p> : null}
        </div>
        <div className="exam-card-list">
          {schedule.data?.map((exam) => (
            <article className="panel student-exam-card" key={exam.id}>
              <div>
                <span className={`status status--${exam.status}`}>
                  {exam.attemptStatus ?? 'scheduled'}
                </span>
                <h3>{exam.name}</h3>
                <p>{exam.description}</p>
                <span>
                  {new Date(exam.startAt).toLocaleString()} ·{' '}
                  {Math.round(exam.durationSeconds / 60)} minutes
                </span>
                {exam.sebConfigurationUrl ? (
                  <a href={exam.sebConfigurationUrl}>Open Safe Exam Browser configuration</a>
                ) : null}
              </div>
              <button
                className="primary-button"
                disabled={Boolean(exam.attemptStatus && exam.attemptStatus !== 'interrupted')}
                onClick={() => setSelected(exam)}
              >
                {exam.attemptStatus === 'interrupted' ? 'Resume' : 'Enter exam'}
              </button>
            </article>
          ))}
        </div>
        {selected ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="exam-entry-title"
            >
              <h2 id="exam-entry-title">Enter {selected.name}</h2>
              <p>{selected.instructions}</p>
              <label>
                Exam password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                />
              </label>
              {selected.lockdownRequired ? (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={fallback}
                    onChange={(event) => setFallback(event.target.checked)}
                  />
                  Use administrator-approved standard-browser fallback
                </label>
              ) : null}
              {enter.error ? <p className="form-error">{message(enter.error)}</p> : null}
              <div className="dialog-actions">
                <button onClick={() => setSelected(undefined)}>Cancel</button>
                <button
                  className="primary-button"
                  disabled={enter.isPending}
                  onClick={() => enter.mutate()}
                >
                  Authorize and start
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
      <aside className="student-aside">
        <section className="panel">
          <p className="eyebrow">Published results</p>
          <h2>Results</h2>
          {results.data?.length ? (
            results.data.map((result: ResultView) => (
              <article className="result-summary" key={result.id}>
                <strong>{result.examName}</strong>
                <span>
                  {result.score}/{result.maximumScore} · {result.percentage.toFixed(1)}% · Grade{' '}
                  {result.grade}
                </span>
                <a href={identityApi.marksheetUrl(result.id)} target="_blank" rel="noreferrer">
                  Download PDF marksheet
                </a>
              </article>
            ))
          ) : (
            <p>No published results yet.</p>
          )}
        </section>
        <section className="panel">
          <p className="eyebrow">Notifications</p>
          <h2>Inbox</h2>
          {notifications.data?.slice(0, 8).map((notification) => (
            <article className="notification" key={notification.publicId}>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
            </article>
          ))}
        </section>
      </aside>
    </div>
  );
}

function ExamRunner({
  initial,
  session,
  onFinished,
}: {
  initial: AttemptView;
  session: SessionSummary;
  onFinished: () => Promise<void>;
}): ReactElement {
  const [attempt, setAttempt] = useState(initial);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial.answers);
  const [sequences, setSequences] = useState<Record<string, number>>(initial.saveSequences);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline' | 'pending' | 'failed'>(
    'saved',
  );
  const [now, setNow] = useState(Date.now());
  const submitting = useRef(false);
  const sectionTransitioning = useRef(false);
  const question = attempt.questions[current];
  const report = useCallback(
    (type: Parameters<typeof identityApi.integrityEvent>[1]['type']) => {
      void identityApi
        .integrityEvent(attempt.id, { type, occurredAt: new Date().toISOString() })
        .catch(() => undefined);
    },
    [attempt.id],
  );
  const sync = useCallback(
    async (inputs?: SaveAnswerInput[]) => {
      const queued = inputs ?? (await pendingAnswers(attempt.id));
      if (!queued.length) return;
      if (!navigator.onLine) {
        setSaveState('offline');
        return;
      }
      setSaveState('saving');
      try {
        const result = await identityApi.saveAnswers(attempt.id, queued);
        await clearPending(
          attempt.id,
          result.saved.map((item) => item.questionInstanceId),
        );
        setAttempt((value) => ({
          ...value,
          revision: result.revision,
          offlineLeaseExpiresAt: new Date(Date.now() + 90_000).toISOString(),
        }));
        setSaveState('saved');
      } catch {
        setSaveState('failed');
      }
    },
    [attempt.id],
  );
  const save = useCallback(
    async (instanceId: string, value: unknown, markedForReview = false) => {
      const sequence = (sequences[instanceId] ?? 0) + 1;
      const input: SaveAnswerInput = {
        questionInstanceId: instanceId,
        sequence,
        attemptRevision: attempt.revision,
        clientEventAt: new Date().toISOString(),
        answer: value,
        markedForReview,
      };
      setAnswers((items) => ({ ...items, [instanceId]: value }));
      setSequences((items) => ({ ...items, [instanceId]: sequence }));
      setAttempt((currentAttempt) => ({
        ...currentAttempt,
        questions: currentAttempt.questions.map((item) =>
          item.instanceId === instanceId ? { ...item, markedForReview } : item,
        ),
      }));
      await queueAnswer(attempt.id, input);
      setSaveState(navigator.onLine ? 'pending' : 'offline');
      await sync([input]);
    },
    [attempt.id, attempt.revision, sequences, sync],
  );
  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    await sync();
    try {
      await identityApi.submitAttempt(attempt.id, crypto.randomUUID());
      await onFinished();
    } finally {
      submitting.current = false;
    }
  }, [attempt.id, onFinished, sync]);
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const autosave = window.setInterval(() => void sync(), 30_000);
    const heartbeat = window.setInterval(
      () =>
        void identityApi
          .heartbeat(attempt.id)
          .then((data) =>
            setAttempt((value) => ({
              ...value,
              endsAt: data.endsAt,
              sectionEndsAt: data.sectionEndsAt,
              offlineLeaseExpiresAt: data.offlineLeaseExpiresAt,
              status: data.status as AttemptView['status'],
            })),
          )
          .catch(() => setSaveState('offline')),
      20_000,
    );
    return () => {
      clearInterval(clock);
      clearInterval(autosave);
      clearInterval(heartbeat);
    };
  }, [attempt.id, sync]);
  useEffect(() => {
    if (new Date(attempt.endsAt).getTime() <= now) void submit();
  }, [attempt.endsAt, now, submit]);
  useEffect(() => {
    if (
      sectionTransitioning.current ||
      new Date(attempt.sectionEndsAt).getTime() > now ||
      new Date(attempt.endsAt).getTime() <= now
    )
      return;
    sectionTransitioning.current = true;
    void identityApi
      .attempt(attempt.id)
      .then(async (next) => {
        if (['submitted', 'auto-submitted', 'terminated'].includes(next.status)) {
          await onFinished();
          return;
        }
        setAttempt(next);
        setCurrent(0);
      })
      .finally(() => {
        sectionTransitioning.current = false;
      });
  }, [attempt.endsAt, attempt.id, attempt.sectionEndsAt, now, onFinished]);
  useEffect(() => {
    const visibility = (): void => {
      if (document.hidden) report('visibility-hidden');
    };
    const blur = (): void => report('window-blur');
    const fullscreen = (): void => {
      if (!document.fullscreenElement) report('fullscreen-exit');
    };
    const offline = (): void => {
      setSaveState('offline');
      report('offline');
    };
    const online = (): void => {
      report('reconnected');
      void sync();
    };
    const block = (event: Event): void => {
      event.preventDefault();
      const mapping: Record<string, Parameters<typeof report>[0]> = {
        copy: 'copy',
        paste: 'paste',
        contextmenu: 'context-menu',
        beforeprint: 'print',
      };
      report(mapping[event.type]!);
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    document.addEventListener('fullscreenchange', fullscreen);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    for (const type of ['copy', 'paste', 'contextmenu', 'beforeprint'])
      document.addEventListener(type, block);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      document.removeEventListener('fullscreenchange', fullscreen);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      for (const type of ['copy', 'paste', 'contextmenu', 'beforeprint'])
        document.removeEventListener(type, block);
    };
  }, [report, sync]);
  const selected = question ? answers[question.instanceId] : undefined;
  return (
    <div className="exam-runner">
      <div className="watermark" aria-hidden="true">
        {session.user.fullName} · {session.user.rollNumber} · {attempt.id.slice(0, 8)} ·{' '}
        {new Date(now).toLocaleString()}
      </div>
      <header className="exam-header">
        <div>
          <p className="eyebrow">Secure examination</p>
          <h1>{attempt.examName}</h1>
          <span>
            {session.user.fullName} · {session.user.rollNumber}
          </span>
        </div>
        <div className="timer-group">
          <div>
            <span>Total time</span>
            <strong>{remaining(attempt.endsAt, now)}</strong>
          </div>
          <div>
            <span>Section time</span>
            <strong>{remaining(attempt.sectionEndsAt, now)}</strong>
          </div>
          <span className={`save-indicator save--${saveState}`}>{saveState}</span>
          <button onClick={() => void document.documentElement.requestFullscreen()}>
            Fullscreen
          </button>
        </div>
      </header>
      <main className="exam-body">
        <aside className="question-palette">
          <h2>{attempt.section.title}</h2>
          <p>{attempt.section.instructions}</p>
          <div>
            {attempt.questions.map((item, index) => (
              <button
                className={`${index === current ? 'current' : ''} ${answers[item.instanceId] !== undefined ? 'answered' : ''}`}
                key={item.instanceId}
                onClick={() => setCurrent(index)}
                disabled={attempt.section.navigation === 'forward-only' && index < current}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </aside>
        <section className="question-stage">
          {question ? (
            <>
              <div className="question-heading">
                <span>
                  Question {current + 1} of {attempt.questions.length}
                </span>
                <span>
                  {question.marks} marks
                  {question.negativeMarks ? ` · −${question.negativeMarks}` : ''}
                </span>
              </div>
              <div className="exam-question-prompt">
                <RichText text={question.prompt} />
              </div>
              {question.mediaIds.map((mediaId) => (
                <img
                  className="exam-question-media"
                  key={mediaId}
                  src={identityApi.attemptMediaUrl(attempt.id, mediaId)}
                  alt="Question reference"
                />
              ))}
              {question.chemicalStructure ? (
                <ChemicalPreview structure={question.chemicalStructure} />
              ) : null}
              <div className="answer-controls">
                {question.type === 'single-choice'
                  ? question.options.map((option) => (
                      <label className="answer-option" key={option.id}>
                        <input
                          type="radio"
                          name={question.instanceId}
                          checked={selected === option.id}
                          onChange={() => void save(question.instanceId, option.id)}
                        />
                        <RichText text={option.text} />
                      </label>
                    ))
                  : null}
                {question.type === 'multiple-select'
                  ? question.options.map((option) => {
                      const values = Array.isArray(selected) ? (selected as string[]) : [];
                      return (
                        <label className="answer-option" key={option.id}>
                          <input
                            type="checkbox"
                            checked={values.includes(option.id)}
                            onChange={() =>
                              void save(
                                question.instanceId,
                                values.includes(option.id)
                                  ? values.filter((id) => id !== option.id)
                                  : [...values, option.id],
                              )
                            }
                          />
                          <RichText text={option.text} />
                        </label>
                      );
                    })
                  : null}
                {question.type === 'true-false'
                  ? [true, false].map((value) => (
                      <label className="answer-option" key={String(value)}>
                        <input
                          type="radio"
                          name={question.instanceId}
                          checked={selected === value}
                          onChange={() => void save(question.instanceId, value)}
                        />
                        {value ? 'True' : 'False'}
                      </label>
                    ))
                  : null}
                {question.type === 'numerical' ? (
                  <label>
                    Numerical answer{' '}
                    {question.numerical?.unit ? `(${question.numerical.unit})` : ''}
                    <input
                      type="number"
                      step="any"
                      value={typeof selected === 'number' ? selected : ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value !== '') void save(question.instanceId, Number(value));
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <div className="exam-navigation">
                <button
                  disabled={current === 0 || attempt.section.navigation === 'forward-only'}
                  onClick={() => setCurrent((value) => value - 1)}
                >
                  Previous
                </button>
                <button
                  onClick={() =>
                    void save(question.instanceId, selected ?? null, !question.markedForReview)
                  }
                >
                  Mark for review
                </button>
                {current < attempt.questions.length - 1 ? (
                  <button
                    className="primary-button"
                    onClick={() => setCurrent((value) => value + 1)}
                  >
                    Save & next
                  </button>
                ) : attempt.currentSectionIndex < attempt.sectionCount - 1 ? (
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (window.confirm('Leave this timed section? You cannot return.'))
                        void identityApi
                          .transitionSection(attempt.id, attempt.currentSectionIndex + 1)
                          .then((next) => {
                            setAttempt(next);
                            setCurrent(0);
                          });
                    }}
                  >
                    Next section
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (window.confirm('Submit your examination?')) void submit();
                    }}
                  >
                    Submit examination
                  </button>
                )}
              </div>
            </>
          ) : null}
        </section>
      </main>
      <footer className="exam-footer">
        <span>
          Network: {navigator.onLine ? 'online' : 'offline'} · Offline allowance ends{' '}
          {new Date(attempt.offlineLeaseExpiresAt).toLocaleTimeString()}
        </span>
        <button
          className="danger-button"
          onClick={() => {
            if (window.confirm('Submit your examination? Submitted answers cannot be changed.'))
              void submit();
          }}
        >
          Submit examination
        </button>
      </footer>
    </div>
  );
}
