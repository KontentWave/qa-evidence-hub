'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  fetchAuthenticatedCsrfToken,
  navigateBrowser,
  readApiErrorBody,
} from '../lib/browser-csrf';
import { localDateTimeToUtcIso, resolveSafeTimeZone } from '../lib/timezone';

type SessionFieldId =
  | 'session-purpose'
  | 'session-started-at'
  | 'session-ended-at'
  | 'session-environment'
  | 'session-device'
  | 'session-os'
  | 'session-browser'
  | 'session-build-version'
  | 'session-notes';

interface FieldIssueLink {
  readonly fieldId: SessionFieldId;
  readonly message: string;
}

interface SessionFormErrorState {
  readonly summary: string;
  readonly fieldIssues: readonly FieldIssueLink[];
}

export interface CreateSessionFormProps {
  readonly clientId: string;
  readonly projectId: string;
  readonly ownerTimezone: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly onNavigate?: (targetPath: string) => void;
}

const API_FIELD_TO_CONTROL: Record<string, { fieldId: SessionFieldId; message: string }> = {
  purpose: {
    fieldId: 'session-purpose',
    message: 'Enter a valid session purpose (1 to 200 characters).',
  },
  startedAt: {
    fieldId: 'session-started-at',
    message: 'Enter a valid session start date and time.',
  },
  endedAt: {
    fieldId: 'session-ended-at',
    message: 'End time must not precede start time.',
  },
  environment: {
    fieldId: 'session-environment',
    message: 'Environment must be 200 characters or fewer.',
  },
  device: {
    fieldId: 'session-device',
    message: 'Device must be 200 characters or fewer.',
  },
  os: {
    fieldId: 'session-os',
    message: 'Operating system must be 200 characters or fewer.',
  },
  browser: {
    fieldId: 'session-browser',
    message: 'Browser must be 200 characters or fewer.',
  },
  buildVersion: {
    fieldId: 'session-build-version',
    message: 'Build or version must be 200 characters or fewer.',
  },
  notes: {
    fieldId: 'session-notes',
    message: 'Notes must be 20,000 characters or fewer.',
  },
};

export function CreateSessionForm({
  clientId,
  projectId,
  ownerTimezone,
  fetchImpl,
  onNavigate,
}: CreateSessionFormProps) {
  const safeTimezone = resolveSafeTimeZone(ownerTimezone);

  const [purpose, setPurpose] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [environment, setEnvironment] = useState('');
  const [device, setDevice] = useState('');
  const [os, setOs] = useState('');
  const [browser, setBrowser] = useState('');
  const [buildVersion, setBuildVersion] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorState, setErrorState] = useState<SessionFormErrorState | null>(null);
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

  const reportError = (next: SessionFormErrorState): void => {
    setErrorState(next);
    setErrorKey((prev) => prev + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const trimmedPurpose = purpose.trim();
    const trimmedStarted = startedAt.trim();
    const trimmedEnded = endedAt.trim();
    const trimmedEnv = environment.trim();
    const trimmedDevice = device.trim();
    const trimmedOs = os.trim();
    const trimmedBrowser = browser.trim();
    const trimmedBuild = buildVersion.trim();
    const trimmedNotes = notes.trim();

    const fieldIssues: FieldIssueLink[] = [];

    if (trimmedPurpose.length === 0) {
      fieldIssues.push({
        fieldId: 'session-purpose',
        message: 'Enter a session purpose.',
      });
    } else if (trimmedPurpose.length > 200) {
      fieldIssues.push({
        fieldId: 'session-purpose',
        message: 'Session purpose must be 200 characters or fewer.',
      });
    }

    const startedUtcIso =
      trimmedStarted.length > 0 ? localDateTimeToUtcIso(trimmedStarted, safeTimezone) : null;
    if (!startedUtcIso) {
      fieldIssues.push({
        fieldId: 'session-started-at',
        message: `Enter a valid start date and time in ${safeTimezone}.`,
      });
    }

    let endedUtcIso: string | null = null;
    if (trimmedEnded.length > 0) {
      endedUtcIso = localDateTimeToUtcIso(trimmedEnded, safeTimezone);
      if (!endedUtcIso) {
        fieldIssues.push({
          fieldId: 'session-ended-at',
          message: `Enter a valid end date and time in ${safeTimezone}.`,
        });
      } else if (
        startedUtcIso &&
        new Date(endedUtcIso).getTime() < new Date(startedUtcIso).getTime()
      ) {
        fieldIssues.push({
          fieldId: 'session-ended-at',
          message: 'End time must not precede start time.',
        });
      }
    }

    if (trimmedEnv.length > 200) {
      fieldIssues.push({
        fieldId: 'session-environment',
        message: 'Environment must be 200 characters or fewer.',
      });
    }
    if (trimmedDevice.length > 200) {
      fieldIssues.push({
        fieldId: 'session-device',
        message: 'Device must be 200 characters or fewer.',
      });
    }
    if (trimmedOs.length > 200) {
      fieldIssues.push({
        fieldId: 'session-os',
        message: 'Operating system must be 200 characters or fewer.',
      });
    }
    if (trimmedBrowser.length > 200) {
      fieldIssues.push({
        fieldId: 'session-browser',
        message: 'Browser must be 200 characters or fewer.',
      });
    }
    if (trimmedBuild.length > 200) {
      fieldIssues.push({
        fieldId: 'session-build-version',
        message: 'Build or version must be 200 characters or fewer.',
      });
    }
    if (trimmedNotes.length > 20000) {
      fieldIssues.push({
        fieldId: 'session-notes',
        message: 'Notes must be 20,000 characters or fewer.',
      });
    }

    if (fieldIssues.length > 0 || !startedUtcIso) {
      reportError({
        summary: 'Correct the highlighted session fields before saving.',
        fieldIssues,
      });
      return;
    }

    setSubmitting(true);
    try {
      const csrfToken = await ensureCsrf();
      const response = await requestFetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/sessions`,
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
            purpose: trimmedPurpose,
            startedAt: startedUtcIso,
            endedAt: endedUtcIso,
            environment: trimmedEnv.length > 0 ? trimmedEnv : null,
            device: trimmedDevice.length > 0 ? trimmedDevice : null,
            os: trimmedOs.length > 0 ? trimmedOs : null,
            browser: trimmedBrowser.length > 0 ? trimmedBrowser : null,
            buildVersion: trimmedBuild.length > 0 ? trimmedBuild : null,
            notes: trimmedNotes.length > 0 ? trimmedNotes : null,
          }),
        },
      );

      if (response.status === 201 || response.ok) {
        setErrorState(null);
        navigateBrowser(`/clients/${clientId}/projects/${projectId}`, onNavigate);
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

      if (response.status === 409) {
        reportError({
          summary: 'This project is archived and cannot receive new test sessions.',
          fieldIssues: [],
        });
        return;
      }

      if (response.status === 404) {
        reportError({
          summary: 'The parent project could not be found.',
          fieldIssues: [],
        });
        return;
      }

      const errorBody = await readApiErrorBody(response);
      const serverIssues: FieldIssueLink[] = [];
      for (const entry of errorBody.fieldErrors ?? []) {
        const mapped = API_FIELD_TO_CONTROL[entry.field];
        if (mapped) {
          serverIssues.push(mapped);
        }
      }

      reportError({
        summary:
          serverIssues.length > 0
            ? 'Correct the highlighted session fields before saving.'
            : 'Unable to save test session. Check your input and try again.',
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

  const isInvalid = (fieldId: SessionFieldId): boolean =>
    errorState?.fieldIssues.some((issue) => issue.fieldId === fieldId) ?? false;

  return (
    <form className="domain-form" noValidate onSubmit={(e) => void handleSubmit(e)}>
      {errorState ? (
        <div
          aria-labelledby="session-error-heading"
          className="error-summary"
          id="session-error-summary"
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          <p className="error-summary__heading" id="session-error-heading">
            Unable to save test session: {errorState.summary}
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
        <label className="form-label" htmlFor="session-purpose">
          Purpose
        </label>
        <input
          aria-describedby={errorState ? 'session-error-summary' : undefined}
          aria-invalid={isInvalid('session-purpose') ? 'true' : undefined}
          className="form-input"
          id="session-purpose"
          maxLength={200}
          name="purpose"
          onChange={(e) => setPurpose(e.target.value)}
          required
          type="text"
          value={purpose}
        />
      </div>

      <div className="form-grid-two">
        <div className="form-field">
          <label className="form-label" htmlFor="session-started-at">
            Start time ({safeTimezone})
          </label>
          <input
            aria-describedby={errorState ? 'session-error-summary' : undefined}
            aria-invalid={isInvalid('session-started-at') ? 'true' : undefined}
            className="form-input"
            id="session-started-at"
            name="startedAt"
            onChange={(e) => setStartedAt(e.target.value)}
            required
            type="datetime-local"
            value={startedAt}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="session-ended-at">
            End time ({safeTimezone}, optional)
          </label>
          <input
            aria-describedby={errorState ? 'session-error-summary' : undefined}
            aria-invalid={isInvalid('session-ended-at') ? 'true' : undefined}
            className="form-input"
            id="session-ended-at"
            name="endedAt"
            onChange={(e) => setEndedAt(e.target.value)}
            type="datetime-local"
            value={endedAt}
          />
        </div>
      </div>

      <div className="form-grid-two">
        <div className="form-field">
          <label className="form-label" htmlFor="session-environment">
            Environment (optional)
          </label>
          <input
            aria-describedby={errorState ? 'session-error-summary' : undefined}
            aria-invalid={isInvalid('session-environment') ? 'true' : undefined}
            className="form-input"
            id="session-environment"
            maxLength={200}
            name="environment"
            onChange={(e) => setEnvironment(e.target.value)}
            type="text"
            value={environment}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="session-device">
            Device (optional)
          </label>
          <input
            aria-describedby={errorState ? 'session-error-summary' : undefined}
            aria-invalid={isInvalid('session-device') ? 'true' : undefined}
            className="form-input"
            id="session-device"
            maxLength={200}
            name="device"
            onChange={(e) => setDevice(e.target.value)}
            type="text"
            value={device}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="session-os">
            Operating system (optional)
          </label>
          <input
            aria-describedby={errorState ? 'session-error-summary' : undefined}
            aria-invalid={isInvalid('session-os') ? 'true' : undefined}
            className="form-input"
            id="session-os"
            maxLength={200}
            name="os"
            onChange={(e) => setOs(e.target.value)}
            type="text"
            value={os}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="session-browser">
            Browser (optional)
          </label>
          <input
            aria-describedby={errorState ? 'session-error-summary' : undefined}
            aria-invalid={isInvalid('session-browser') ? 'true' : undefined}
            className="form-input"
            id="session-browser"
            maxLength={200}
            name="browser"
            onChange={(e) => setBrowser(e.target.value)}
            type="text"
            value={browser}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="session-build-version">
            Build or version (optional)
          </label>
          <input
            aria-describedby={errorState ? 'session-error-summary' : undefined}
            aria-invalid={isInvalid('session-build-version') ? 'true' : undefined}
            className="form-input"
            id="session-build-version"
            maxLength={200}
            name="buildVersion"
            onChange={(e) => setBuildVersion(e.target.value)}
            type="text"
            value={buildVersion}
          />
        </div>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="session-notes">
          Notes (optional)
        </label>
        <textarea
          aria-describedby={errorState ? 'session-error-summary' : undefined}
          aria-invalid={isInvalid('session-notes') ? 'true' : undefined}
          className="form-input form-textarea"
          id="session-notes"
          maxLength={20000}
          name="notes"
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          value={notes}
        />
      </div>

      <div className="form-actions">
        <button className="btn-primary" disabled={submitting} type="submit">
          {submitting ? 'Creating session…' : 'Create session'}
        </button>
      </div>
    </form>
  );
}
