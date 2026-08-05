import type { UserRole } from '@bsbe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState, type FormEvent, type ReactElement } from 'react';
import { ApiFailure, identityApi } from '../lib/api';

const QuestionBank = lazy(async () => {
  const module = await import('../components/question-bank');
  return { default: module.QuestionBank };
});
const AdminExamWorkspace = lazy(async () => {
  const module = await import('../components/exam-portal');
  return { default: module.AdminExamWorkspace };
});
const StudentExamWorkspace = lazy(async () => {
  const module = await import('../components/exam-portal');
  return { default: module.StudentExamWorkspace };
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

function formValue(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

function LoginPanel(): ReactElement {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState<string>();
  const requestOtp = useMutation({
    mutationFn: () => identityApi.requestOtp(email),
    onSuccess: (result) => setChallengeId(result.challengeId),
  });
  const verifyOtp = useMutation({
    mutationFn: () => identityApi.verifyOtp(challengeId!, otp),
    onSuccess: (session) => queryClient.setQueryData(['session'], session),
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (challengeId) verifyOtp.mutate();
    else requestOtp.mutate();
  };

  const error = requestOtp.error ?? verifyOtp.error;
  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <p className="eyebrow">BSBE · Secure access</p>
        <h1>Placement Mock Test Portal</h1>
        <p>
          Sign in with your registered account email. Candidates must use their IIT Bombay email.
        </p>
        <ul>
          <li>No password to remember</li>
          <li>Short-lived, single-use email code</li>
          <li>One active session per student</li>
        </ul>
      </section>
      <section className="auth-card" aria-labelledby="sign-in-heading">
        <span className="brand-mark" aria-hidden="true">
          BS
        </span>
        <p className="eyebrow">Identity verification</p>
        <h2 id="sign-in-heading">{challengeId ? 'Enter your code' : 'Sign in'}</h2>
        <form onSubmit={submit}>
          <label htmlFor="email">Account email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            disabled={Boolean(challengeId)}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {challengeId ? (
            <>
              <label htmlFor="otp">Six-digit verification code</label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
              />
              <p className="form-help">Only the latest code works. It expires shortly.</p>
            </>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {errorMessage(error)}
            </p>
          ) : null}
          {requestOtp.isSuccess && challengeId ? (
            <p className="form-success" role="status">
              {requestOtp.data.message}
            </p>
          ) : null}
          <button className="primary-button" disabled={requestOtp.isPending || verifyOtp.isPending}>
            {requestOtp.isPending || verifyOtp.isPending
              ? 'Please wait…'
              : challengeId
                ? 'Verify and continue'
                : 'Email me a code'}
          </button>
          {challengeId ? (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setChallengeId(undefined);
                setOtp('');
                requestOtp.reset();
                verifyOtp.reset();
              }}
            >
              Use a different email
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}

function IdentityWorkspace(): ReactElement {
  const queryClient = useQueryClient();
  const programs = useQuery({ queryKey: ['programs'], queryFn: identityApi.programs });
  const users = useQuery({ queryKey: ['users'], queryFn: () => identityApi.users() });
  const [role, setRole] = useState<UserRole>('student');
  const [formError, setFormError] = useState('');
  const createProgram = useMutation({
    mutationFn: ({ code, name }: { code: string; name: string }) =>
      identityApi.createProgram(code, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['programs'] }),
  });
  const createUser = useMutation({
    mutationFn: (input: Parameters<typeof identityApi.createUser>[0]) =>
      identityApi.createUser(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
  const updateStatus = useMutation({
    mutationFn: ({
      userId,
      status,
      reason,
    }: {
      userId: string;
      status: 'active' | 'inactive';
      reason: string;
    }) => identityApi.updateUserStatus(userId, status, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const submitProgram = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createProgram.mutate({ code: formValue(data, 'code'), name: formValue(data, 'name') });
    event.currentTarget.reset();
  };
  const submitUser = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFormError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      email: formValue(data, 'email'),
      fullName: formValue(data, 'fullName'),
      role,
      ...(role === 'student'
        ? { rollNumber: formValue(data, 'rollNumber'), programId: formValue(data, 'programId') }
        : {}),
    };
    createUser.mutate(input, {
      onSuccess: () => form.reset(),
      onError: (error) => setFormError(errorMessage(error)),
    });
  };

  return (
    <div className="admin-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>Accounts</h2>
          </div>
          <span>{users.data?.length ?? 0}</span>
        </div>
        {users.isLoading ? <p>Loading accounts…</p> : null}
        {users.error ? <p className="form-error">{errorMessage(users.error)}</p> : null}
        <div className="account-list">
          {users.data?.map((user) => (
            <article className="account-row" key={user.id}>
              <div className="avatar" aria-hidden="true">
                {user.fullName.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{user.fullName}</strong>
                <span>{user.email}</span>
                <small>
                  {user.role === 'student'
                    ? `${user.rollNumber} · ${user.program?.name ?? 'No program'}`
                    : 'Administrator'}
                </small>
              </div>
              <div className="account-actions">
                <span className={`status status--${user.status}`}>{user.status}</span>
                <button
                  className="text-button"
                  onClick={() => {
                    const reason = window.prompt(
                      `Reason to ${user.status === 'active' ? 'deactivate' : 'activate'} ${user.fullName}:`,
                    );
                    if (reason && reason.trim().length >= 4)
                      updateStatus.mutate({
                        userId: user.id,
                        status: user.status === 'active' ? 'inactive' : 'active',
                        reason: reason.trim(),
                      });
                  }}
                >
                  {user.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <aside className="admin-aside">
        <section className="panel compact-panel">
          <p className="eyebrow">Account administration</p>
          <h2>Create account</h2>
          <form onSubmit={submitUser}>
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" required maxLength={160} />
            <label htmlFor="newEmail">
              {role === 'student' ? 'IIT Bombay email' : 'Administrator email'}
            </label>
            <input id="newEmail" name="email" type="email" required />
            <label htmlFor="role">Role</label>
            <select
              id="role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
            >
              <option value="student">Student</option>
              <option value="admin">Administrator</option>
            </select>
            {role === 'student' ? (
              <>
                <label htmlFor="rollNumber">Roll number</label>
                <input id="rollNumber" name="rollNumber" required />
                <label htmlFor="programId">Program</label>
                <select id="programId" name="programId" required>
                  <option value="">Select a program</option>
                  {programs.data
                    ?.filter((program) => program.active)
                    .map((program) => (
                      <option value={program.id} key={program.id}>
                        {program.name}
                      </option>
                    ))}
                </select>
              </>
            ) : null}
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <button className="primary-button" disabled={createUser.isPending}>
              Create account
            </button>
          </form>
        </section>
        <section className="panel compact-panel">
          <p className="eyebrow">Reference data</p>
          <h2>Add program</h2>
          <form onSubmit={submitProgram}>
            <label htmlFor="programCode">Code</label>
            <input id="programCode" name="code" required maxLength={32} />
            <label htmlFor="programName">Display name</label>
            <input id="programName" name="name" required maxLength={120} />
            {createProgram.error ? (
              <p className="form-error">{errorMessage(createProgram.error)}</p>
            ) : null}
            <button className="secondary-button" disabled={createProgram.isPending}>
              Add program
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

function AdminWorkspace(): ReactElement {
  const [section, setSection] = useState<'identity' | 'questions' | 'exams'>('exams');
  return (
    <>
      <nav className="workspace-tabs" aria-label="Administration sections">
        <button
          className={section === 'exams' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
          onClick={() => setSection('exams')}
        >
          Exams &amp; operations
        </button>
        <button
          className={
            section === 'questions' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'
          }
          onClick={() => setSection('questions')}
        >
          Question bank
        </button>
        <button
          className={
            section === 'identity' ? 'workspace-tab workspace-tab--active' : 'workspace-tab'
          }
          onClick={() => setSection('identity')}
        >
          People &amp; programs
        </button>
      </nav>
      {section === 'exams' ? (
        <Suspense fallback={<section className="panel">Loading examination operations…</section>}>
          <AdminExamWorkspace />
        </Suspense>
      ) : section === 'questions' ? (
        <Suspense fallback={<section className="panel">Loading question bank…</section>}>
          <QuestionBank />
        </Suspense>
      ) : (
        <IdentityWorkspace />
      )}
    </>
  );
}

function SignedInPortal({
  session,
}: {
  session: Awaited<ReturnType<typeof identityApi.session>>;
}): ReactElement {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: identityApi.logout,
    onSuccess: () => queryClient.setQueryData(['session'], null),
  });
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-brand">
          <span className="brand-mark" aria-hidden="true">
            BS
          </span>
          <div>
            <strong>Placement Mock Test Portal</strong>
            <span>BSBE Department</span>
          </div>
        </div>
        <div className="user-menu">
          <div>
            <strong>{session.user.fullName}</strong>
            <span>
              {session.user.role === 'admin'
                ? 'Administrator'
                : `${session.user.rollNumber} · ${session.user.program?.name ?? ''}`}
            </span>
          </div>
          <button className="text-button" onClick={() => logout.mutate()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="portal-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Phase 3 · Question bank</p>
            <h1>
              {session.user.role === 'admin' ? 'Assessment administration' : 'Student dashboard'}
            </h1>
          </div>
          <span className="security-chip">Secure session active</span>
        </div>
        {session.user.role === 'admin' ? (
          <AdminWorkspace />
        ) : (
          <Suspense fallback={<section className="panel">Loading candidate dashboard…</section>}>
            <StudentExamWorkspace session={session} />
          </Suspense>
        )}
      </main>
    </div>
  );
}

export function PortalPage(): ReactElement {
  const session = useQuery({ queryKey: ['session'], queryFn: identityApi.session, retry: false });
  if (session.isLoading)
    return (
      <main className="loading-screen">
        <span className="brand-mark">BS</span>
        <p>Checking your secure session…</p>
      </main>
    );
  if (session.error && (!(session.error instanceof ApiFailure) || session.error.status !== 401))
    return (
      <main className="loading-screen">
        <h1>Portal unavailable</h1>
        <p>{errorMessage(session.error)}</p>
      </main>
    );
  return session.data ? <SignedInPortal session={session.data} /> : <LoginPanel />;
}
