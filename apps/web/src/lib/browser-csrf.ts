export interface ApiFieldValidationIssue {
  readonly field: string;
  readonly issues: readonly string[];
}

export interface ParsedApiErrorBody {
  readonly code?: string;
  readonly message?: string;
  readonly fieldErrors?: readonly ApiFieldValidationIssue[];
}

export function navigateBrowser(
  targetPath: string,
  customNavigate?: (path: string) => void,
): void {
  if (customNavigate) {
    customNavigate(targetPath);
    return;
  }
  window.location.assign(targetPath);
}

export async function fetchAuthenticatedCsrfToken(
  requestFetch: typeof globalThis.fetch,
): Promise<string> {
  const res = await requestFetch('/api/v1/auth/csrf', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error('Unable to load session anti-CSRF token.');
  }
  const payload = (await res.json()) as { csrfToken?: unknown };
  if (typeof payload.csrfToken !== 'string' || payload.csrfToken.length === 0) {
    throw new Error('Invalid anti-CSRF token response.');
  }
  return payload.csrfToken;
}

export async function readApiErrorBody(response: Response): Promise<ParsedApiErrorBody> {
  try {
    const parsed = (await response.json()) as ParsedApiErrorBody;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
