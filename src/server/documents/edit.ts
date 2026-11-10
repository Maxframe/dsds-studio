import { readFileSync, writeFileSync } from 'node:fs';
import type { EditOp } from '@shared/types';
import { packForSchemaVersion } from '../packs';
import { Project } from '../projects/project';
import { loadPackRuntime } from '../validator/pack-runtime';
import { DsdsDocument } from './document';

export class FileNotFound extends Error {}

/**
 * Apply edits by JSON Pointer to a document file through the lossless document model, put the
 * fields in schema order with the pack's own formatter (YAML only), and write it. Returns the new
 * text. Throws `FileNotFound` if the file can't be read, or an Error for an edit that doesn't apply.
 */
export function applyOpsToFile(dir: string, abs: string, ops: EditOp[]): string {
  let doc: DsdsDocument;
  try {
    doc = DsdsDocument.parse(readFileSync(abs, 'utf8'));
  } catch {
    throw new FileNotFound('File not found');
  }
  for (const op of ops) {
    if (op.op === 'set') doc.setAt(op.pointer, op.value);
    else if (op.op === 'remove') doc.removeAt(op.pointer);
    else if (op.op === 'append') doc.appendAt(op.pointer, op.value);
    else if (op.op === 'move') doc.moveAt(op.pointer, op.from, op.to);
    else throw new Error('Unknown op');
  }
  let text = doc.toText();
  // Skipped if the formatter cannot parse the text or changes nothing; JSON is re-serialised as is.
  const version = doc.schemaVersion ? packForSchemaVersion(doc.schemaVersion) : null;
  const pack = version?.pack.version ?? Project.load({ dir }).pack()?.pack.version;
  if (doc.format === 'yaml' && pack) {
    const formatted = loadPackRuntime(pack).formatText(text);
    if (!formatted.error) text = formatted.text;
  }
  writeFileSync(abs, text);
  return text;
}
