import type {
  DraftState,
  DiffResult,
  EditOp,
  FileState,
  PackInfo,
  ProjectInfo,
  ProjectOverview,
  VersionInfo,
  RefTarget,
} from '@shared/types';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const q = (path: string) => `path=${encodeURIComponent(path)}`;

export const api = {
  packs: () => call<PackInfo[]>('/api/packs'),
  schema: (version: string) => call<Record<string, unknown>>(`/api/packs/${version}/schema`),
  projects: () => call<ProjectInfo[]>('/api/projects'),
  createProject: (name: string) => call<ProjectInfo>('/api/projects', post({ name })),
  project: (slug: string) => call<ProjectOverview>(`/api/projects/${slug}`),
  targets: (slug: string) => call<RefTarget[]>(`/api/projects/${slug}/targets`),
  file: (slug: string, path: string) => call<FileState>(`/api/projects/${slug}/file?${q(path)}`),
  applyOps: (slug: string, path: string, ops: EditOp[]) =>
    call<FileState>(`/api/projects/${slug}/file/ops?${q(path)}`, post({ ops })),
  draft: (slug: string) => call<DraftState>(`/api/projects/${slug}/draft`),
  discardDraft: (slug: string) =>
    call<DraftState & { discarded: boolean }>(`/api/projects/${slug}/draft/discard`, {
      method: 'POST',
    }),
  saveVersion: (slug: string, input: { label?: string; tag?: string; stamp?: boolean }) =>
    call<DraftState>(`/api/projects/${slug}/versions`, post(input)),
  diff: (slug: string, from: string, to: string) =>
    call<DiffResult>(
      `/api/projects/${slug}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  versions: (slug: string) => call<VersionInfo[]>(`/api/projects/${slug}/versions`),
  tagVersion: (slug: string, id: string, tag: string) =>
    call<VersionInfo[]>(`/api/projects/${slug}/versions/${id}/tag`, post({ tag })),
  nameVersion: (slug: string, id: string, label: string) =>
    call<VersionInfo[]>(`/api/projects/${slug}/versions/${id}/name`, post({ label })),
  restoreVersion: (slug: string, id: string) =>
    call<DraftState>(`/api/projects/${slug}/versions/${id}/restore`, post({})),
  deleteFile: (slug: string, path: string) =>
    call<{ trashed: string }>(`/api/projects/${slug}/file?${q(path)}`, { method: 'DELETE' }),
  saveText: (slug: string, path: string, text: string) =>
    call<FileState>(`/api/projects/${slug}/file?${q(path)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
};
