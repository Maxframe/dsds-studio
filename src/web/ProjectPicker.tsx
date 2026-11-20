import { useEffect, useState } from 'react';
import { parsePlatforms } from '@shared/platforms';
import type { PackInfo, ProjectInfo } from '@shared/types';
import { api } from './api';
import { Button } from '@web/components/ui/button';
import { Input } from '@web/components/ui/input';
import { ConfirmButton } from './ConfirmButton';
import { OpenFolder } from './OpenFolder';

export function ProjectPicker({ onOpen }: { onOpen(slug: string): void }) {
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [name, setName] = useState('');
  const [platformsText, setPlatformsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const reload = () =>
    api
      .projects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void reload();
    api
      .packs()
      .then(setPacks)
      .catch(() => setPacks([]));
  }, []);

  // What will be written: valid ids, so a typo such as "react native" is seen before it is saved.
  const platforms = parsePlatforms(platformsText);

  const create = async () => {
    setError(null);
    try {
      const p = await api.createProject(name, platforms);
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
          <div key={p.slug} className="row">
            <button type="button" className="tree-item card" onClick={() => onOpen(p.slug)}>
              <span>
                <strong>{p.title ?? p.slug}</strong>
                {p.title || p.linked ? (
                  <span className="muted block">
                    {[
                      p.slug,
                      p.linked?.root,
                      p.linked?.documentationDir
                        ? `documentation in ${p.linked.documentationDir}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
              </span>
              <span className="muted">
                {p.documents} document{p.documents === 1 ? '' : 's'}
              </span>
            </button>
            {p.linked ? (
              <ConfirmButton
                compact
                label={`Stop listing ${p.slug}`}
                confirmLabel="Stop listing"
                hint="Only removes it from this list. The folder and its saved versions stay."
                onConfirm={() =>
                  void api
                    .unlinkProject(p.slug)
                    .then(reload)
                    .catch((e: Error) => setError(e.message))
                }
              />
            ) : null}
          </div>
        ))}
      </div>
      <p>
        <Button variant="secondary" onClick={() => setOpening(true)}>
          Open a folder…
        </Button>
      </p>
      <OpenFolder open={opening} onClose={() => setOpening(false)} onOpen={onOpen} />

      <h2>New project</h2>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="row">
          <Input
            placeholder="Design system name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Design system name"
          />
          <Button type="submit" variant="default" disabled={!name.trim()}>
            Create
          </Button>
        </div>
        <Input
          placeholder="Platforms, such as react, ios (optional)"
          value={platformsText}
          onChange={(e) => setPlatformsText(e.target.value)}
          aria-label="Platforms (optional)"
        />
        {platforms.length > 0 ? (
          <p className="field-note" aria-live="polite">
            Saved as: {platforms.join(', ')}
          </p>
        ) : null}
        <p className="field-note">
          Separate platforms with commas. Once declared, every platform used in the documents has to
          be one of these.
        </p>
      </form>
      {error ? <p className="field-note field-note--error">{error}</p> : null}
    </div>
  );
}
