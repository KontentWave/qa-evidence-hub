'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  fetchAuthenticatedCsrfToken,
  navigateBrowser,
  readApiErrorBody,
} from '../lib/browser-csrf';

type ClientFieldId = 'client-name' | 'client-notes';

interface FieldIssueLink {
  readonly fieldId: ClientFieldId;
  readonly message: string;
}

interface ClientFormErrorState {
  readonly summary: string;
  readonly fieldIssues: readonly FieldIssueLink[];
}

export interface CreateClientFormProps {
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly onNavigate?: (targetPath: string) => void;
}

export function CreateClientForm({ fetchImpl, onNavigate }: CreateClientFormProps) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorState, setErrorState] = useState<ClientFormErrorState | null>(null);
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

  const reportError = (next: ClientFormErrorState): void => {
    setErrorState(next);
    setErrorKey((prev) => prev + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedNotes = notes.trim();
    const fieldIssues: FieldIssueLink[] = [];

    if (trimmedName.length === 0) {
      fieldIssues.push({
        fieldId: 'client-name',
        message: 'Enter a client name.',
      });
    } else if (trimmedName.length > 200) {
      fieldIssues.push({
        fieldId: 'client-name',
        message: 'Client name must be 200 characters or fewer.',
      });
    }

    if (trimmedNotes.length > 20000) {
      fieldIssues.push({
        fieldId: 'client-notes',
        message: 'Client notes must be 20,000 characters or fewer.',
      });
    }

    if (fieldIssues.length > 0) {
      reportError({
        summary: 'Correct the highlighted client fields before saving.',
        fieldIssues,
      });
      return;
    }

    setSubmitting(true);
    try {
      const csrfToken = await ensureCsrf();
      const response = await requestFetch('/api/v1/clients', {
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
          notes: trimmedNotes.length > 0 ? trimmedNotes : null,
        }),
      });

      if (response.status === 201 || response.ok) {
        const created = (await response.json()) as { id: string };
        setErrorState(null);
        navigateBrowser(`/clients/${created.id}`, onNavigate);
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

      const errorBody = await readApiErrorBody(response);
      const serverIssues: FieldIssueLink[] = [];
      for (const entry of errorBody.fieldErrors ?? []) {
        if (entry.field === 'name') {
          serverIssues.push({
            fieldId: 'client-name',
            message: 'Enter a valid client name (1 to 200 characters).',
          });
        } else if (entry.field === 'notes') {
          serverIssues.push({
            fieldId: 'client-notes',
            message: 'Client notes must be 20,000 characters or fewer.',
          });
        }
      }

      reportError({
        summary:
          serverIssues.length > 0
            ? 'Correct the highlighted client fields before saving.'
            : 'Unable to save client. Check your input and try again.',
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

  const nameInvalid =
    errorState?.fieldIssues.some((issue) => issue.fieldId === 'client-name') ?? false;
  const notesInvalid =
    errorState?.fieldIssues.some((issue) => issue.fieldId === 'client-notes') ?? false;

  return (
    <form className="domain-form" noValidate onSubmit={(e) => void handleSubmit(e)}>
      {errorState ? (
        <div
          aria-labelledby="client-error-heading"
          className="error-summary"
          id="client-error-summary"
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          <p className="error-summary__heading" id="client-error-heading">
            Unable to save client: {errorState.summary}
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
        <label className="form-label" htmlFor="client-name">
          Client name
        </label>
        <input
          aria-describedby={errorState ? 'client-error-summary' : undefined}
          aria-invalid={nameInvalid ? 'true' : undefined}
          className="form-input"
          id="client-name"
          maxLength={200}
          name="name"
          onChange={(e) => setName(e.target.value)}
          required
          type="text"
          value={name}
        />
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="client-notes">
          Notes (optional)
        </label>
        <textarea
          aria-describedby={errorState ? 'client-error-summary' : undefined}
          aria-invalid={notesInvalid ? 'true' : undefined}
          className="form-input form-textarea"
          id="client-notes"
          maxLength={20000}
          name="notes"
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          value={notes}
        />
      </div>

      <div className="form-actions">
        <button className="btn-primary" disabled={submitting} type="submit">
          {submitting ? 'Creating client…' : 'Create client'}
        </button>
      </div>
    </form>
  );
}
