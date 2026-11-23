'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  fetchAuthenticatedCsrfToken,
  navigateBrowser,
  readApiErrorBody,
} from '../lib/browser-csrf';

type ProjectFieldId =
  | 'project-name'
  | 'project-description'
  | 'project-testing-context'
  | 'project-instructions';

interface FieldIssueLink {
  readonly fieldId: ProjectFieldId;
  readonly message: string;
}

interface ProjectFormErrorState {
  readonly summary: string;
  readonly fieldIssues: readonly FieldIssueLink[];
}

export interface CreateProjectFormProps {
  readonly clientId: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly onNavigate?: (targetPath: string) => void;
}

export function CreateProjectForm({ clientId, fetchImpl, onNavigate }: CreateProjectFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [testingContext, setTestingContext] = useState('');
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorState, setErrorState] = useState<ProjectFormErrorState | null>(null);
  const [errorKey, setErrorKey] = useState(0);

  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const csrfTokenRef = useRef<string | null>(null);
  const csrfInflightRef = useRef<Promise<string> | null>(null);

  const requestFetch: typeof globalThis.fetch = (input, init) => {
    const fn = fetchImpl ?? globalThis.fetch;
    return fn(input, init);
  };

  const ensureCsrf = async (): Promise<string> => {
    if (csrfTokenRef.current) {
      return csrfTokenRef.current;
    }
    if (!csrfInflightRef.current) {
      csrfInflightRef.current = fetchAuthenticatedCsrfToken(requestFetch)
        .then((token) => {
          csrfTokenRef.current = token;
          return token;
        })
        .finally(() => {
          csrfInflightRef.current = null;
        });
    }
    return csrfInflightRef.current;
  };

  useEffect(() => {
    void ensureCsrf().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (errorState && errorSummaryRef.current) {
      errorSummaryRef.current.focus();
    }
  }, [errorState, errorKey]);

  const reportError = (next: ProjectFormErrorState): void => {
    setErrorState(next);
    setErrorKey((prev) => prev + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedContext = testingContext.trim();
    const trimmedInstructions = instructions.trim();
    const fieldIssues: FieldIssueLink[] = [];

    if (trimmedName.length === 0) {
      fieldIssues.push({
        fieldId: 'project-name',
        message: 'Enter a project name.',
      });
    } else if (trimmedName.length > 200) {
      fieldIssues.push({
        fieldId: 'project-name',
        message: 'Project name must be 200 characters or fewer.',
      });
    }

    if (trimmedDescription.length > 20000) {
      fieldIssues.push({
        fieldId: 'project-description',
        message: 'Description must be 20,000 characters or fewer.',
      });
    }
    if (trimmedContext.length > 20000) {
      fieldIssues.push({
        fieldId: 'project-testing-context',
        message: 'Testing context must be 20,000 characters or fewer.',
      });
    }
    if (trimmedInstructions.length > 20000) {
      fieldIssues.push({
        fieldId: 'project-instructions',
        message: 'Instructions must be 20,000 characters or fewer.',
      });
    }

    if (fieldIssues.length > 0) {
      reportError({
        summary: 'Correct the highlighted project fields before saving.',
        fieldIssues,
      });
      return;
    }

    setSubmitting(true);
    try {
      const csrfToken = await ensureCsrf();
      const response = await requestFetch(
        `/api/v1/clients/${encodeURIComponent(clientId)}/projects`,
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            name: trimmedName,
            description: trimmedDescription.length > 0 ? trimmedDescription : null,
            testingContext: trimmedContext.length > 0 ? trimmedContext : null,
            instructions: trimmedInstructions.length > 0 ? trimmedInstructions : null,
          }),
        },
      );

      if (response.status === 201 || response.ok) {
        const created = (await response.json()) as { id: string };
        setErrorState(null);
        navigateBrowser(`/clients/${clientId}/projects/${created.id}`, onNavigate);
        return;
      }

      if (response.status === 401) {
        navigateBrowser('/login', onNavigate);
        return;
      }

      if (response.status === 403) {
        csrfTokenRef.current = null;
        reportError({
          summary:
            'Browser security token expired or origin check failed. Submit again to refresh.',
          fieldIssues: [],
        });
        return;
      }

      if (response.status === 404) {
        reportError({
          summary: 'The parent client could not be found.',
          fieldIssues: [],
        });
        return;
      }

      const errorBody = await readApiErrorBody(response);
      const serverIssues: FieldIssueLink[] = [];
      for (const entry of errorBody.fieldErrors ?? []) {
        if (entry.field === 'name') {
          serverIssues.push({
            fieldId: 'project-name',
            message: 'Enter a valid project name (1 to 200 characters).',
          });
        } else if (entry.field === 'description') {
          serverIssues.push({
            fieldId: 'project-description',
            message: 'Description must be 20,000 characters or fewer.',
          });
        } else if (entry.field === 'testingContext') {
          serverIssues.push({
            fieldId: 'project-testing-context',
            message: 'Testing context must be 20,000 characters or fewer.',
          });
        } else if (entry.field === 'instructions') {
          serverIssues.push({
            fieldId: 'project-instructions',
            message: 'Instructions must be 20,000 characters or fewer.',
          });
        }
      }

      reportError({
        summary:
          serverIssues.length > 0
            ? 'Correct the highlighted project fields before saving.'
            : 'Unable to save project. Check your input and try again.',
        fieldIssues: serverIssues,
      });
    } catch {
      reportError({
        summary: 'Unable to reach the workspace service. Check connectivity and try again.',
        fieldIssues: [],
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isInvalid = (fieldId: ProjectFieldId): boolean =>
    errorState?.fieldIssues.some((issue) => issue.fieldId === fieldId) ?? false;

  return (
    <form className="domain-form" noValidate onSubmit={(e) => void handleSubmit(e)}>
      {errorState ? (
        <div
          aria-labelledby="project-error-heading"
          className="error-summary"
          id="project-error-summary"
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          <p className="error-summary__heading" id="project-error-heading">
            Unable to save project: {errorState.summary}
          </p>
          {errorState.fieldIssues.length > 0 ? (
            <ul className="error-summary__list">
              {errorState.fieldIssues.map((issue) => (
                <li key={issue.fieldId}>
                  <a href={`#${issue.fieldId}`}>{issue.message}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="form-field">
        <label className="form-label" htmlFor="project-name">
          Project name
        </label>
        <input
          aria-describedby={errorState ? 'project-error-summary' : undefined}
          aria-invalid={isInvalid('project-name') ? 'true' : undefined}
          className="form-input"
          id="project-name"
          maxLength={200}
          name="name"
          onChange={(e) => setName(e.target.value)}
          required
          type="text"
          value={name}
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="project-description">
          Description (optional)
        </label>
        <textarea
          aria-describedby={errorState ? 'project-error-summary' : undefined}
          aria-invalid={isInvalid('project-description') ? 'true' : undefined}
          className="form-input form-textarea"
          id="project-description"
          maxLength={20000}
          name="description"
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          value={description}
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="project-testing-context">
          Testing context (optional)
        </label>
        <textarea
          aria-describedby={errorState ? 'project-error-summary' : undefined}
          aria-invalid={isInvalid('project-testing-context') ? 'true' : undefined}
          className="form-input form-textarea"
          id="project-testing-context"
          maxLength={20000}
          name="testingContext"
          onChange={(e) => setTestingContext(e.target.value)}
          rows={3}
          value={testingContext}
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="project-instructions">
          Instructions (optional)
        </label>
        <textarea
          aria-describedby={errorState ? 'project-error-summary' : undefined}
          aria-invalid={isInvalid('project-instructions') ? 'true' : undefined}
          className="form-input form-textarea"
          id="project-instructions"
          maxLength={20000}
          name="instructions"
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          value={instructions}
        />
      </div>

      <div className="form-actions">
        <button className="btn-primary" disabled={submitting} type="submit">
          {submitting ? 'Creating project…' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
