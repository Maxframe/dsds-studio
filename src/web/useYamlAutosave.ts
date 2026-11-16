import { useCallback, useEffect, useRef, useState } from 'react';
import { parseDocument } from 'yaml';
import type { FileState } from '@shared/types';
import { api } from './api';

export type YamlStatus = { kind: 'ok' | 'saving' | 'error'; message: string };

const SAVE_DELAY_MS = 500;
const firstLine = (s: string) => s.split('\n')[0] ?? s;

/**
 * Autosave for text typed in the code panel: waits for a pause in typing, refuses text that does
 * not parse, and lets other edits flush pending text first so nothing is lost or overwritten.
 */
export function useYamlAutosave(
  slug: string,
  onSaved: (path: string, state: FileState) => Promise<void> | void,
) {
  const [status, setStatus] = useState<YamlStatus>({ kind: 'ok', message: 'Saved' });
  const pending = useRef<{ path: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedHandler = useRef(onSaved);
  useEffect(() => {
    savedHandler.current = onSaved;
  });

  /** Save what is pending now. Resolves when done (or when there was nothing to save). */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    const problem = parseDocument(job.text).errors[0];
    if (problem) {
      setStatus({ kind: 'error', message: `Not saved: ${firstLine(problem.message)}` });
      return;
    }
    setStatus({ kind: 'saving', message: 'Saving…' });
    try {
      const state = await api.saveText(slug, job.path, job.text);
      await savedHandler.current(job.path, state);
      setStatus({ kind: 'ok', message: 'Saved' });
    } catch (e) {
      setStatus({ kind: 'error', message: `Not saved: ${(e as Error).message}` });
    }
  }, [slug]);

  /** The user typed: remember the text and save after a pause. */
  const schedule = useCallback(
    (path: string, text: string) => {
      pending.current = { path, text };
      const problem = parseDocument(text).errors[0];
      setStatus(
        problem
          ? { kind: 'error', message: `Not saved: ${firstLine(problem.message)}` }
          : { kind: 'saving', message: 'Unsaved changes…' },
      );
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  /** A different save (a form edit) went through, so whatever the panel shows is now saved. */
  const markSaved = useCallback(() => setStatus({ kind: 'ok', message: 'Saved' }), []);

  return { status, schedule, flush, markSaved };
}
