/** Length rules for POST /api/requests: too-short values are rejected; stored text is trimmed and capped. */

export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;

export type RequestFieldErrors = {
  title?: string;
  description?: string;
};

function lengthError(
  label: string,
  value: string,
  min: number,
  max: number
): string | undefined {
  const length = value.trim().length;
  if (length < min) {
    return `${label} needs at least ${min} characters (currently ${length}).`;
  }
  if (length > max) {
    return `${label} must be at most ${max} characters (currently ${length}).`;
  }
  return undefined;
}

/** Client-side mirror of the create-request title and description rules. */
export function requestFieldErrors(
  title: string,
  description: string
): RequestFieldErrors {
  const errors: RequestFieldErrors = {};
  const titleError = lengthError("Title", title, TITLE_MIN, TITLE_MAX);
  const descriptionError = lengthError(
    "Description",
    description,
    DESCRIPTION_MIN,
    DESCRIPTION_MAX
  );
  if (titleError) errors.title = titleError;
  if (descriptionError) errors.description = descriptionError;
  return errors;
}

export function requestFieldsValid(title: string, description: string): boolean {
  const errors = requestFieldErrors(title, description);
  return !errors.title && !errors.description;
}
