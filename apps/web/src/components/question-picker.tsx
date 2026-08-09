import type { QuestionSummary } from '@bsbe/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { identityApi } from '../lib/api';
import { RichText } from './question-bank';

const TYPE_LABELS: Record<QuestionSummary['type'], string> = {
  'single-choice': 'Single choice',
  'multiple-select': 'Multiple select',
  'true-false': 'True / false',
  numerical: 'Numerical',
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The preview could not be loaded.';
}

export function QuestionPicker({
  questions,
  initialSelected,
  onApply,
  onClose,
}: {
  questions: QuestionSummary[];
  initialSelected: string[];
  onApply: (questionIds: string[]) => void;
  onClose: () => void;
}): ReactElement {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const [search, setSearch] = useState('');
  const [type, setType] = useState<QuestionSummary['type'] | ''>('');
  const [difficulty, setDifficulty] = useState<QuestionSummary['difficulty'] | ''>('');
  const [view, setView] = useState<'all' | 'selected'>('all');
  const [previewId, setPreviewId] = useState(initialSelected[0] ?? questions[0]?.id);
  const [page, setPage] = useState(1);
  const preview = useQuery({
    queryKey: ['question', 'exam-picker', previewId],
    queryFn: () => identityApi.question(previewId!),
    enabled: Boolean(previewId),
  });
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return questions.filter((question) => {
      if (view === 'selected' && !selected.has(question.id)) return false;
      if (type && question.type !== type) return false;
      if (difficulty && question.difficulty !== difficulty) return false;
      if (!query) return true;
      return [
        question.promptSummary,
        ...question.tags,
        TYPE_LABELS[question.type],
        question.difficulty,
        `${question.marks} marks`,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [difficulty, questions, search, selected, type, view]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const toggle = (questionId: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  return (
    <div
      className="modal-backdrop question-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="question-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="question-picker-title"
      >
        <header className="question-picker-header">
          <div>
            <p className="eyebrow">Exam question pool</p>
            <h2 id="question-picker-title">Choose questions</h2>
            <p className="form-help">Search, preview, and select questions for this section.</p>
          </div>
          <button
            type="button"
            className="question-picker-close"
            onClick={onClose}
            aria-label="Close question picker"
          >
            ×
          </button>
        </header>

        <div className="question-picker-filters">
          <input
            autoFocus
            aria-label="Search question text or tags"
            placeholder="Search question text, tags, type, or marks"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Filter questions by type"
            value={type}
            onChange={(event) => {
              setType(event.target.value as QuestionSummary['type'] | '');
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter questions by difficulty"
            value={difficulty}
            onChange={(event) => {
              setDifficulty(event.target.value as QuestionSummary['difficulty'] | '');
              setPage(1);
            }}
          >
            <option value="">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSearch('');
              setType('');
              setDifficulty('');
              setPage(1);
            }}
          >
            Clear
          </button>
        </div>

        <div className="question-picker-tabs" role="tablist" aria-label="Question views">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'all'}
            className={view === 'all' ? 'active' : ''}
            onClick={() => {
              setView('all');
              setPage(1);
            }}
          >
            All questions ({questions.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'selected'}
            className={view === 'selected' ? 'active' : ''}
            onClick={() => {
              setView('selected');
              setPage(1);
            }}
          >
            Selected ({selected.size})
          </button>
        </div>

        <div className="question-picker-body">
          <div className="question-picker-results">
            <div className="question-picker-results-heading">
              <span>
                {filtered.length} {filtered.length === 1 ? 'question' : 'questions'} found
              </span>
              {visible.length ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      visible.forEach((question) => next.add(question.id));
                      return next;
                    })
                  }
                >
                  Select page
                </button>
              ) : null}
            </div>
            <div className="question-picker-list">
              {visible.map((question) => (
                <article
                  key={question.id}
                  className={`question-picker-item ${
                    previewId === question.id ? 'question-picker-item--previewed' : ''
                  }`}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(question.id)}
                      onChange={() => toggle(question.id)}
                    />
                    <span className="question-picker-item-copy">
                      <strong>{question.promptSummary}</strong>
                      <span className="question-picker-item-meta">
                        {TYPE_LABELS[question.type]} · {question.difficulty} · {question.marks}{' '}
                        {question.marks === 1 ? 'mark' : 'marks'}
                      </span>
                      {question.tags.length ? (
                        <span className="question-picker-item-tags">
                          {question.tags.join(' · ')}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setPreviewId(question.id)}
                  >
                    Preview
                  </button>
                </article>
              ))}
              {!visible.length ? (
                <div className="question-picker-empty">
                  <strong>No matching questions</strong>
                  <span>Try clearing or changing the search filters.</span>
                </div>
              ) : null}
            </div>
            <div className="question-picker-pagination">
              <button
                type="button"
                className="secondary-button"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </div>

          <aside className="question-picker-preview">
            <p className="eyebrow">Question preview</p>
            {preview.isLoading ? <p>Loading preview…</p> : null}
            {preview.error ? <p className="form-error">{message(preview.error)}</p> : null}
            {preview.data ? (
              <>
                <div className="question-meta">
                  <span>{TYPE_LABELS[preview.data.type]}</span>
                  <span>{preview.data.difficulty}</span>
                  <span>
                    {preview.data.marks} {preview.data.marks === 1 ? 'mark' : 'marks'}
                  </span>
                </div>
                <div className="question-picker-preview-prompt">
                  <RichText text={preview.data.prompt} />
                </div>
                {preview.data.options.length ? (
                  <ol className="preview-options">
                    {preview.data.options.map((option) => (
                      <li key={option.id}>
                        <strong>{option.id}</strong>
                        <RichText text={option.text} />
                      </li>
                    ))}
                  </ol>
                ) : null}
                {preview.data.type === 'numerical' ? (
                  <div className="preview-answer-space">Numerical response</div>
                ) : null}
                {preview.data.tags.length ? (
                  <div className="tag-list">
                    {preview.data.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : !previewId ? (
              <p className="form-help">Choose Preview beside a question to inspect it here.</p>
            ) : null}
          </aside>
        </div>

        <footer className="question-picker-footer">
          <div>
            <strong>{selected.size} selected</strong>
            <button type="button" className="text-button" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                onApply(
                  questions
                    .filter((question) => selected.has(question.id))
                    .map((question) => question.id),
                )
              }
            >
              Use selected questions
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
