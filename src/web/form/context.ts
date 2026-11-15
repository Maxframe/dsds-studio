import { createContext, useContext } from 'react';
import type { SchemaBundle } from '@shared/schema';
import type { EditOp, Finding, RefTarget, ResolvedItem, Succession } from '@shared/types';

export interface FormContext {
  bundle: SchemaBundle;
  /** Apply edits to the open file. Rejects with the server's message on failure. */
  apply(ops: EditOp[]): Promise<void>;
  findings: Finding[];
  targets: RefTarget[];
  /** Values other fields like the one at `pointer` hold, with how many fields hold each. */
  usage(pointer: string): Map<string, number>;
  /** The namespace a new custom value (like a custom kind) gets, so nobody has to type it. */
  namespace: string;
  /** The value in the open document at a pointer (to read a sibling field, like a ref's `rel`). */
  valueAt(pointer: string): unknown;
  /** What the resolver works out for the item at `pointer` when it reuses another (§4), else nothing. */
  reused(pointer: string): ResolvedItem | undefined;
  /** What replaces the deprecated trait or trait value at `pointer` (§7), else nothing. */
  succession(pointer: string): Succession | undefined;
  /**
   * An entry's id is about to change. Published ids should not change (Specification §3.1), and
   * what points at it breaks, so the project may ask first: it then calls `commit` or `cancel`.
   */
  requestIdChange(
    from: string,
    to: string,
    done: { pointer: string; commit(): void; cancel(): void },
  ): void;
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
