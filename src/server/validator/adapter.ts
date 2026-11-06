import type { Finding, ValidationResult } from '@shared/types';
import { DsdsDocument } from '../documents/document';
import { loadPackRuntime, type ValidateDocOptions } from './pack-runtime';

export interface ValidateOptions extends ValidateDocOptions {
  /** Promote warnings to failures, like the upstream CLI's `--strict`. */
  strict?: boolean;
}

function summarize(findings: Finding[], packVersion: string, strict: boolean): ValidationResult {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  return {
    ok: errors === 0 && !(strict && warnings > 0),
    errors,
    warnings,
    findings,
    packVersion,
  };
}

const parseFinding = (message: string): Finding => ({
  rule: null,
  severity: 'error',
  pointer: '',
  message,
  fix: 'Fix the file so it parses as a single YAML (or JSON) object.',
  docs: null,
});

/**
 * Validate an already-parsed document with a pack's reference validator. Parse errors and
 * non-mapping documents come back as findings rather than exceptions.
 */
export function validateDocument(
  doc: DsdsDocument,
  packVersion: string,
  opts: ValidateOptions = {},
): ValidationResult {
  const strict = opts.strict ?? false;
  if (doc.parseErrors.length > 0) {
    return summarize(
      doc.parseErrors.map((m) => parseFinding(`could not parse the file: ${m}`)),
      packVersion,
      strict,
    );
  }
  const value = doc.toValue();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return summarize(
      [parseFinding("the file is empty, or isn't a YAML mapping")],
      packVersion,
      strict,
    );
  }
  const { strict: _strict, ...docOpts } = opts;
  void _strict;
  const raw = loadPackRuntime(packVersion).validateDoc(value, docOpts);
  return summarize(raw.findings, packVersion, strict);
}

/** Convenience: parse text, then validate it. */
export function validateText(
  text: string,
  packVersion: string,
  opts: ValidateOptions = {},
): ValidationResult {
  return validateDocument(DsdsDocument.parse(text), packVersion, opts);
}
