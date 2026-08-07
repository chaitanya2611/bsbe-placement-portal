import type {
  ChemicalStructure,
  MediaAsset,
  QuestionDefinition,
  QuestionDifficulty,
  QuestionSummary,
  QuestionType,
  SafeQuestionVersion,
} from '@bsbe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import { identityApi } from '../lib/api';

const TYPE_LABELS: Record<QuestionType, string> = {
  'single-choice': 'Single choice',
  'multiple-select': 'Multiple select',
  'true-false': 'True / false',
  numerical: 'Numerical',
};

interface EditorState {
  type: QuestionType;
  prompt: string;
  marks: string;
  negativeMarks: string;
  difficulty: QuestionDifficulty;
  tags: string;
  explanation: string;
  options: string;
  answer: string;
  toleranceMode: 'exact' | 'absolute' | 'relative';
  tolerance: string;
  unit: string;
  decimalPlaces: string;
  chemicalFormat: '' | ChemicalStructure['format'];
  chemicalSource: string;
  mediaIds: string[];
}

const EMPTY_EDITOR: EditorState = {
  type: 'single-choice',
  prompt: '',
  marks: '1',
  negativeMarks: '0',
  difficulty: 'medium',
  tags: '',
  explanation: '',
  options: 'A|First option\nB|Second option',
  answer: 'A',
  toleranceMode: 'exact',
  tolerance: '0',
  unit: '',
  decimalPlaces: '',
  chemicalFormat: '',
  chemicalSource: '',
  mediaIds: [],
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

function optionsFromText(value: string): Array<{ id: string; text: string }> {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('|');
      if (separator < 1) throw new Error('Write every option as ID|Text, one option per line.');
      return { id: line.slice(0, separator).trim(), text: line.slice(separator + 1).trim() };
    });
}

function definitionFromState(state: EditorState): QuestionDefinition {
  const common = {
    prompt: state.prompt,
    marks: Number(state.marks),
    negativeMarks: Number(state.negativeMarks),
    difficulty: state.difficulty,
    tags: state.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    explanation: state.explanation,
    mediaIds: state.mediaIds,
    ...(state.chemicalFormat && state.chemicalSource.trim()
      ? {
          chemicalStructure: {
            format: state.chemicalFormat,
            source: state.chemicalSource,
          },
        }
      : {}),
  };
  if (state.type === 'single-choice') {
    return {
      ...common,
      type: state.type,
      options: optionsFromText(state.options),
      answer: { optionId: state.answer.trim() },
    };
  }
  if (state.type === 'multiple-select') {
    return {
      ...common,
      type: state.type,
      options: optionsFromText(state.options),
      answer: {
        optionIds: state.answer
          .split(',')
          .map((answer) => answer.trim())
          .filter(Boolean),
      },
    };
  }
  if (state.type === 'true-false') {
    return { ...common, type: state.type, answer: { value: state.answer === 'true' } };
  }
  return {
    ...common,
    type: state.type,
    answer: {
      value: Number(state.answer),
      toleranceMode: state.toleranceMode,
      tolerance: Number(state.tolerance),
    },
    numerical: {
      unit: state.unit,
      ...(state.decimalPlaces ? { decimalPlaces: Number(state.decimalPlaces) } : {}),
    },
  };
}

function stateFromVersion(version: SafeQuestionVersion, answer: unknown): EditorState {
  const answerRecord = answer as Record<string, unknown>;
  const optionId = typeof answerRecord.optionId === 'string' ? answerRecord.optionId : '';
  const optionIds = Array.isArray(answerRecord.optionIds)
    ? answerRecord.optionIds.filter((value): value is string => typeof value === 'string')
    : [];
  const value =
    typeof answerRecord.value === 'number' || typeof answerRecord.value === 'boolean'
      ? answerRecord.value
      : '';
  const toleranceMode = ['exact', 'absolute', 'relative'].includes(
    String(answerRecord.toleranceMode),
  )
    ? (answerRecord.toleranceMode as EditorState['toleranceMode'])
    : 'exact';
  const tolerance = typeof answerRecord.tolerance === 'number' ? answerRecord.tolerance : 0;
  return {
    type: version.type,
    prompt: version.prompt,
    marks: String(version.marks),
    negativeMarks: String(version.negativeMarks),
    difficulty: version.difficulty,
    tags: version.tags.join(', '),
    explanation: version.explanation,
    options: version.options.map((option) => `${option.id}|${option.text}`).join('\n'),
    answer:
      version.type === 'single-choice'
        ? optionId
        : version.type === 'multiple-select'
          ? optionIds.join(', ')
          : version.type === 'true-false'
            ? String(value || false)
            : String(value),
    toleranceMode: version.type === 'numerical' ? toleranceMode : 'exact',
    tolerance: String(tolerance),
    unit: version.numerical?.unit ?? '',
    decimalPlaces:
      version.numerical?.decimalPlaces === null || version.numerical?.decimalPlaces === undefined
        ? ''
        : String(version.numerical.decimalPlaces),
    chemicalFormat: version.chemicalStructure?.format ?? '',
    chemicalSource: version.chemicalStructure?.source ?? '',
    mediaIds: version.mediaIds,
  };
}

export function RichText({ text }: { text: string }): ReactElement {
  const html = useMemo(() => {
    const escaped = DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
    const rendered = escaped.replace(
      /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g,
      (_match, block, inline) =>
        katex.renderToString(String(block ?? inline), {
          displayMode: Boolean(block),
          throwOnError: false,
          trust: false,
          strict: 'warn',
        }),
    );
    return DOMPurify.sanitize(rendered, {
      USE_PROFILES: { html: true, mathMl: true, svg: true },
    });
  }, [text]);
  return <div className="question-rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ChemicalPreview({ structure }: { structure: ChemicalStructure }): ReactElement {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void import('openchemlib')
      .then(({ Molecule }) => {
        const molecule =
          structure.format === 'smiles'
            ? Molecule.fromSmiles(structure.source)
            : Molecule.fromMolfile(structure.source);
        const rendered = molecule.toSVG(420, 240, undefined, {
          suppressChiralText: true,
          suppressCIPParity: true,
        });
        if (active)
          setSvg(
            DOMPurify.sanitize(rendered, {
              USE_PROFILES: { svg: true, svgFilters: false },
            }),
          );
      })
      .catch(() => {
        if (active) setError('This chemical structure could not be rendered.');
      });
    return () => {
      active = false;
    };
  }, [structure]);
  if (error) return <p className="form-error">{error}</p>;
  if (!svg) return <p className="form-help">Rendering structure…</p>;
  return <div className="chemical-preview" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function QuestionPreview({
  state,
  media,
}: {
  state: EditorState;
  media: MediaAsset[];
}): ReactElement {
  let options: Array<{ id: string; text: string }> = [];
  try {
    options = ['single-choice', 'multiple-select'].includes(state.type)
      ? optionsFromText(state.options)
      : [];
  } catch {
    // The editor reports malformed options during submission.
  }
  return (
    <article className="question-preview" aria-label="Student-safe question preview">
      <div className="question-meta">
        <span>{TYPE_LABELS[state.type]}</span>
        <span>{state.marks || '0'} marks</span>
        <span>{state.difficulty}</span>
      </div>
      <RichText text={state.prompt || 'Your question preview appears here.'} />
      {options.length ? (
        <ol className="preview-options">
          {options.map((option) => (
            <li key={option.id}>
              <strong>{option.id}</strong> <RichText text={option.text} />
            </li>
          ))}
        </ol>
      ) : null}
      {state.type === 'true-false' ? (
        <p className="preview-answer-space">○ True &nbsp; ○ False</p>
      ) : null}
      {state.type === 'numerical' ? (
        <p className="preview-answer-space">
          Numerical response {state.unit ? `(${state.unit})` : ''}
        </p>
      ) : null}
      {state.mediaIds.map((id) => {
        const asset = media.find((item) => item.id === id);
        return asset ? (
          <figure key={id}>
            <img src={identityApi.mediaContentUrl(id)} alt={asset.fileName} />
            <figcaption>{asset.fileName}</figcaption>
          </figure>
        ) : null;
      })}
      {state.chemicalFormat && state.chemicalSource ? (
        <ChemicalPreview
          structure={{ format: state.chemicalFormat, source: state.chemicalSource }}
        />
      ) : null}
      {state.explanation ? (
        <details>
          <summary>Explanation preview</summary>
          <RichText text={state.explanation} />
        </details>
      ) : null}
    </article>
  );
}

function QuestionEditor({
  question,
  media,
  onSaved,
  onCancel,
}: {
  question?: SafeQuestionVersion;
  media: MediaAsset[];
  onSaved: (version: SafeQuestionVersion) => void;
  onCancel: () => void;
}): ReactElement {
  const [state, setState] = useState<EditorState>(EMPTY_EDITOR);
  const [error, setError] = useState('');
  const [loadingRubric, setLoadingRubric] = useState(Boolean(question));
  const history = useQuery({
    queryKey: ['question-history', question?.questionId],
    queryFn: () => identityApi.questionHistory(question!.questionId),
    enabled: Boolean(question),
  });

  useEffect(() => {
    let active = true;
    if (!question) {
      setState(EMPTY_EDITOR);
      setLoadingRubric(false);
      return () => {
        active = false;
      };
    }
    setLoadingRubric(true);
    void identityApi
      .revealRubric(question.questionId)
      .then((rubric) => {
        if (active) setState(stateFromVersion(question, rubric.answer));
      })
      .catch((cause: unknown) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoadingRubric(false);
      });
    return () => {
      active = false;
    };
  }, [question]);

  const save = useMutation({
    mutationFn: (definition: QuestionDefinition) =>
      question
        ? identityApi.updateQuestion(question.questionId, question.version, definition)
        : identityApi.createQuestion(definition),
    onSuccess: onSaved,
    onError: (cause) => setError(message(cause)),
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError('');
    try {
      save.mutate(definitionFromState(state));
    } catch (cause) {
      setError(message(cause));
    }
  };
  const update = <Key extends keyof EditorState>(key: Key, value: EditorState[Key]): void =>
    setState((current) => ({ ...current, [key]: value }));

  if (loadingRubric)
    return (
      <section className="panel">
        <p>Loading protected rubric…</p>
      </section>
    );
  return (
    <div className="question-editor-grid">
      <form className="panel question-form" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Immutable versioning</p>
            <h2>{question ? `Edit version ${question.version}` : 'New question'}</h2>
          </div>
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <label htmlFor="questionType">Question type</label>
        <select
          id="questionType"
          value={state.type}
          onChange={(event) => update('type', event.target.value as QuestionType)}
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="prompt">Prompt (supports $inline$ and $$display$$ LaTeX)</label>
        <textarea
          id="prompt"
          required
          maxLength={20000}
          rows={7}
          value={state.prompt}
          onChange={(event) => update('prompt', event.target.value)}
        />
        <div className="form-row form-row--three">
          <div>
            <label htmlFor="marks">Marks</label>
            <input
              id="marks"
              type="number"
              min="0.01"
              step="0.01"
              value={state.marks}
              onChange={(event) => update('marks', event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="negativeMarks">Negative</label>
            <input
              id="negativeMarks"
              type="number"
              min="0"
              step="0.01"
              value={state.negativeMarks}
              onChange={(event) => update('negativeMarks', event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="difficulty">Difficulty</label>
            <select
              id="difficulty"
              value={state.difficulty}
              onChange={(event) => update('difficulty', event.target.value as QuestionDifficulty)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
        <label htmlFor="tags">Tags (comma separated)</label>
        <input
          id="tags"
          value={state.tags}
          onChange={(event) => update('tags', event.target.value)}
          placeholder="biochemistry, metabolism"
        />
        {state.type === 'single-choice' || state.type === 'multiple-select' ? (
          <>
            <label htmlFor="options">Options (one ID|Text per line)</label>
            <textarea
              id="options"
              rows={6}
              value={state.options}
              onChange={(event) => update('options', event.target.value)}
            />
            <label htmlFor="answer">
              Correct option ID
              {state.type === 'multiple-select' ? 's (comma separated, exact set)' : ''}
            </label>
            <input
              id="answer"
              value={state.answer}
              onChange={(event) => update('answer', event.target.value)}
            />
          </>
        ) : null}
        {state.type === 'true-false' ? (
          <>
            <label htmlFor="booleanAnswer">Correct answer</label>
            <select
              id="booleanAnswer"
              value={state.answer === 'true' ? 'true' : 'false'}
              onChange={(event) => update('answer', event.target.value)}
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </>
        ) : null}
        {state.type === 'numerical' ? (
          <>
            <div className="form-row form-row--three">
              <div>
                <label htmlFor="numericalAnswer">Correct value</label>
                <input
                  id="numericalAnswer"
                  type="number"
                  step="any"
                  value={state.answer}
                  onChange={(event) => update('answer', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="toleranceMode">Tolerance</label>
                <select
                  id="toleranceMode"
                  value={state.toleranceMode}
                  onChange={(event) =>
                    update('toleranceMode', event.target.value as EditorState['toleranceMode'])
                  }
                >
                  <option value="exact">Exact</option>
                  <option value="absolute">Absolute</option>
                  <option value="relative">Relative</option>
                </select>
              </div>
              <div>
                <label htmlFor="tolerance">Amount</label>
                <input
                  id="tolerance"
                  type="number"
                  min="0"
                  step="any"
                  disabled={state.toleranceMode === 'exact'}
                  value={state.toleranceMode === 'exact' ? '0' : state.tolerance}
                  onChange={(event) => update('tolerance', event.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label htmlFor="unit">Unit</label>
                <input
                  id="unit"
                  value={state.unit}
                  onChange={(event) => update('unit', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="decimalPlaces">Display decimals</label>
                <input
                  id="decimalPlaces"
                  type="number"
                  min="0"
                  max="12"
                  value={state.decimalPlaces}
                  onChange={(event) => update('decimalPlaces', event.target.value)}
                />
              </div>
            </div>
          </>
        ) : null}
        <fieldset>
          <legend>Supporting media</legend>
          {media.length ? (
            media.map((asset) => (
              <label className="media-choice" key={asset.id}>
                <input
                  type="checkbox"
                  checked={state.mediaIds.includes(asset.id)}
                  onChange={(event) =>
                    update(
                      'mediaIds',
                      event.target.checked
                        ? [...state.mediaIds, asset.id].slice(0, 5)
                        : state.mediaIds.filter((id) => id !== asset.id),
                    )
                  }
                />{' '}
                {asset.fileName} ({asset.width}×{asset.height})
              </label>
            ))
          ) : (
            <p className="form-help">Upload an image from the question-bank toolbar first.</p>
          )}
        </fieldset>
        <label htmlFor="chemicalFormat">Chemical structure</label>
        <select
          id="chemicalFormat"
          value={state.chemicalFormat}
          onChange={(event) =>
            update('chemicalFormat', event.target.value as EditorState['chemicalFormat'])
          }
        >
          <option value="">None</option>
          <option value="smiles">SMILES</option>
          <option value="molfile">MOL / SDF block</option>
        </select>
        {state.chemicalFormat ? (
          <textarea
            aria-label="Chemical structure source"
            rows={5}
            value={state.chemicalSource}
            onChange={(event) => update('chemicalSource', event.target.value)}
          />
        ) : null}
        <label htmlFor="explanation">Explanation (not shown during attempts)</label>
        <textarea
          id="explanation"
          rows={5}
          value={state.explanation}
          onChange={(event) => update('explanation', event.target.value)}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary-button" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : question ? 'Create new version' : 'Create question'}
        </button>
        {question ? (
          <details className="version-history">
            <summary>Version and usage history</summary>
            {history.isLoading ? <p>Loading history…</p> : null}
            {history.error ? <p className="form-error">{message(history.error)}</p> : null}
            <ul>
              {history.data?.versions.map((version) => (
                <li key={version.id}>
                  Version {version.version} · {new Date(version.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
            <p className="form-help">
              {history.data?.usage.length
                ? `Used by ${history.data.usage.length} immutable exam version(s).`
                : 'Not yet used by a published exam version.'}
            </p>
          </details>
        ) : null}
      </form>
      <section className="panel preview-panel">
        <p className="eyebrow">Safe student view</p>
        <h2>Preview</h2>
        <QuestionPreview state={state} media={media} />
      </section>
    </div>
  );
}

export function QuestionBank(): ReactElement {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    search: '',
    type: '' as QuestionType | '',
    difficulty: '' as QuestionDifficulty | '',
    tag: '',
  });
  const [editing, setEditing] = useState<SafeQuestionVersion | 'new' | undefined>();
  const [notice, setNotice] = useState('');
  const questions = useQuery({
    queryKey: ['questions', filters],
    queryFn: () => identityApi.questions(filters),
  });
  const media = useQuery({ queryKey: ['media'], queryFn: identityApi.media });
  const upload = useMutation({
    mutationFn: identityApi.uploadMedia,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['media'] }),
  });
  const remove = useMutation({
    mutationFn: identityApi.deleteQuestion,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['questions'] });
      setNotice('Question deleted.');
    },
  });
  const filteredQuestions = useMemo(() => {
    const items = questions.data ?? [];
    const search = filters.search.trim().toLowerCase();
    return items.filter((question) => {
      if (filters.type && question.type !== filters.type) return false;
      if (filters.difficulty && question.difficulty !== filters.difficulty) return false;
      if (!search) return true;
      const haystack = [
        question.promptSummary,
        question.type,
        question.difficulty,
        question.tags.join(' '),
        `v${question.version}`,
        `${question.marks} marks`,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [filters.difficulty, filters.search, filters.type, questions.data]);

  const beginEdit = async (summary: QuestionSummary): Promise<void> => {
    try {
      setEditing(await identityApi.question(summary.id));
    } catch (cause) {
      setNotice(message(cause));
    }
  };
  if (editing) {
    const editorProps = {
      media: media.data ?? [],
      onCancel: () => setEditing(undefined),
      onSaved: (version: SafeQuestionVersion) => {
        setEditing(undefined);
        setNotice(`Question version ${version.version} saved.`);
        void queryClient.invalidateQueries({ queryKey: ['questions'] });
      },
    };
    return editing === 'new' ? (
      <QuestionEditor {...editorProps} />
    ) : (
      <QuestionEditor {...editorProps} question={editing} />
    );
  }
  return (
    <div className="question-bank">
      <section className="question-toolbar panel">
        <div>
          <p className="eyebrow">Phase 3</p>
          <h2>Question pool</h2>
          <p className="form-help">
            Versioned questions, protected rubrics, equations, structures, and private media.
          </p>
        </div>
        <div className="toolbar-actions">
          <label className="secondary-button upload-button">
            Upload image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
              }}
            />
          </label>
          <button className="primary-button" onClick={() => setEditing('new')}>
            New question
          </button>
        </div>
      </section>
      <section className="panel filter-grid" aria-label="Question filters">
        <input
          aria-label="Search questions"
          placeholder="Search question text, tags, v#, or marks"
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
        />
        <select
          aria-label="Filter by type"
          value={filters.type}
          onChange={(event) =>
            setFilters((current) => ({ ...current, type: event.target.value as QuestionType | '' }))
          }
        >
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by difficulty"
          value={filters.difficulty}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              difficulty: event.target.value as QuestionDifficulty | '',
            }))
          }
        >
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <button
          className="secondary-button"
          onClick={() => setFilters({ search: '', type: '', difficulty: '', tag: '' })}
        >
          Clear filters
        </button>
      </section>
      {notice ? (
        <p className="form-success" role="status">
          {notice}
        </p>
      ) : null}
      {upload.error || remove.error ? (
        <p className="form-error" role="alert">
          {message(upload.error ?? remove.error)}
        </p>
      ) : null}
      {questions.isLoading ? <p>Loading questions…</p> : null}
      {questions.error ? <p className="form-error">{message(questions.error)}</p> : null}
      <p className="form-help">
        Showing {filteredQuestions.length} of {questions.data?.length ?? 0} questions.
      </p>
      <section className="question-list">
        {filteredQuestions.map((question) => (
          <article className="panel question-row" key={question.id}>
            <div className="question-row-main">
              <div className="question-meta">
                <span>{TYPE_LABELS[question.type]}</span>
                <span>v{question.version}</span>
                <span>{question.difficulty}</span>
                <span>{question.marks} marks</span>
              </div>
              <h3>{question.promptSummary}</h3>
              <div className="tag-list">
                {question.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <div className="question-row-actions">
              <button className="text-button" onClick={() => void beginEdit(question)}>
                Preview / edit
              </button>
              <button
                className="text-button"
                onClick={() => {
                  if (window.confirm('Delete this question? This cannot be undone.')) {
                    remove.mutate(question.id);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
        {!questions.isLoading && questions.data?.length === 0 ? (
          <div className="panel empty-state">
            <h3>No questions found</h3>
            <p>Adjust the filters or create your first question.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
