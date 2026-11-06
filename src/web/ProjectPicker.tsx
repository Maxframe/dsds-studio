import { useEffect, useState } from 'react';
import type { PackInfo, ProjectInfo } from '@shared/types';
import { api } from './api';

export function ProjectPicker({ onOpen }: { onOpen(slug: string): void }) {
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message));
    api
      .packs()
      .then(setPacks)
      .catch(() => setPacks([]));
  }, []);

  const create = async () => {
    setError(null);
    try {
      const p = await api.createProject(name);
      onOpen(p.slug);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="picker">
      <h1>DSDS Studio</h1>
      <p className="muted">
        Schema packs: {packs.map((p) => p.version).join(', ') || 'none installed'}
      </p>

      <h2>Projects</h2>
      {projects === null ? <p className="muted">Loading…</p> : null}
      {projects?.length === 0 ? <p className="muted">No projects yet. Create one below.</p> : null}
      <div className="stack">
        {projects?.map((p) => (
          <button
            key={p.slug}
            type="button"
            className="tree-item card"
            onClick={() => onOpen(p.slug)}
          >
            <strong>{p.slug}</strong>
            <span className="muted">
              {p.documents} document{p.documents === 1 ? '' : 's'}
            </span>
          </button>
        ))}
      </div>

      <h2>New project</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          className="input"
          placeholder="Design system name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Design system name"
        />
        <button type="submit" className="button button--primary" disabled={!name.trim()}>
          Create
        </button>
      </form>
      {error ? <p className="field-note field-note--error">{error}</p> : null}
    </div>
  );
}
