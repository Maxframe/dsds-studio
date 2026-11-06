import { createContext, useContext } from 'react';
import type { SchemaBundle } from '@shared/schema';
import type { EditOp, Finding, RefTarget } from '@shared/types';

export interface FormContext {
  bundle: SchemaBundle;
  /** Apply edits to the open file. Rejects with the server's message on failure. */
  apply(ops: EditOp[]): Promise<void>;
  findings: Finding[];
  targets: RefTarget[];
  /** Pointer to scroll to and highlight (set by clicking a validation finding). */
  focus: string | null;
}

const Ctx = createContext<FormContext | null>(null);
export const FormProvider = Ctx.Provider;

export function useForm(): FormContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useForm outside <FormProvider>');
  return ctx;
}

/** Findings reported exactly at `pointer`. */
export const findingsAt = (ctx: FormContext, pointer: string): Finding[] =>
  ctx.findings.filter((f) => f.pointer === pointer);
