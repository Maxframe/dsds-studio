import { useEffect, useState } from 'react';
import type { FolderInspection, FolderListing, LinkResult } from '@shared/types';
import { api } from './api';
import { Button } from '@web/components/ui/button';
import { Checkbox } from '@web/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@web/components/ui/dialog';
import { Input } from '@web/components/ui/input';

/**
 * Open a folder from anywhere on disk as a project. Step 1 picks the folder (the server lists
 * folders, since a browser cannot hand out real paths); step 2 asks where the tokens are and where
 * the documentation goes. Only the documentation folder is written to and versioned.
 */
export function OpenFolder(props: { open: boolean; onClose(): void; onOpen(slug: string): void }) {
  const [folder, setFolder] = useState<string | null>(null);
  const close = () => {
    setFolder(null);
    props.onClose();
  };
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        {folder === null ? (
          <Pick onChoose={setFolder} />
        ) : (
          <Setup root={folder} onBack={() => setFolder(null)} onOpen={props.onOpen} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Pick({ onChoose }: { onChoose(path: string): void }) {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = async (path?: string) => {
    setError(null);
    try {
      const next = await api.folders(path);
      setListing(next);
      setTyped(next.path);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    api
      .folders()
      .then((first) => {
        setListing(first);
        setTyped(first.path);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Open a folder</DialogTitle>
        <DialogDescription>
          Choose the folder that holds your design system, for example the repo with the tokens.
        </DialogDescription>
      </DialogHeader>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void go(typed);
        }}
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="Folder path"
          placeholder="/path/to/folder"
        />
        <Button type="submit" variant="secondary">
          Go
        </Button>
      </form>
      {error ? <p className="field-note field-note--error">{error}</p> : null}
      <DialogBody>
        {listing ? (
          <nav className="stack" aria-label="Folders">
            {listing.parent ? (
              <button
                type="button"
                className="tree-item"
                onClick={() => void go(listing.parent ?? undefined)}
              >
                ↑ Up
              </button>
            ) : null}
            {listing.folders.map((f) => (
              <button
                key={f.path}
                type="button"
                className="tree-item"
                onClick={() => void go(f.path)}
              >
                {f.name}
              </button>
            ))}
            {listing.folders.length === 0 ? <p className="muted">No subfolders.</p> : null}
          </nav>
        ) : null}
      </DialogBody>
      <Button disabled={!listing} onClick={() => listing && onChoose(listing.path)}>
        Choose this folder
      </Button>
    </>
  );
}

function Setup(props: { root: string; onBack(): void; onOpen(slug: string): void }) {
  const [found, setFound] = useState<FolderInspection | null>(null);
  const [name, setName] = useState('');
  const [documentationDir, setDocumentationDir] = useState('documentation');
  const [tokensDir, setTokensDir] = useState('');
  const [linkTokens, setLinkTokens] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<LinkResult | null>(null);

  useEffect(() => {
    api
      .inspectFolder(props.root)
      .then((f) => {
        setFound(f);
        setName(f.name);
        setDocumentationDir(f.documentationDirs[0] ?? 'documentation');
        setTokensDir(f.tokenDirs[0] ?? '');
      })
      .catch((e: Error) => setError(e.message));
  }, [props.root]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.linkProject({
        root: props.root,
        name: name.trim(),
        documentationDir: documentationDir.trim() || '.',
        tokensDir: tokensDir.trim() || null,
        linkTokens: linkTokens && tokensDir.trim() !== '',
      });
      if (result.warnings.length === 0) props.onOpen(result.project.slug);
      else setDone(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Opened “{done.project.slug}”</DialogTitle>
          <DialogDescription>Check these before you continue.</DialogDescription>
        </DialogHeader>
        {done.warnings.map((w) => (
          <p key={w} className="field-note field-note--warning">
            {w}
          </p>
        ))}
        <Button onClick={() => props.onOpen(done.project.slug)}>Open project</Button>
      </>
    );
  }

  const choices = (label: string, options: string[], set: (v: string) => void) =>
    options.length > 0 ? (
      <p className="field-note">
        {label}:{' '}
        {options.map((o) => (
          <button key={o} type="button" className="link-button" onClick={() => set(o)}>
            {o}
          </button>
        ))}
      </p>
    ) : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Set up “{found?.folder ?? '…'}”</DialogTitle>
        <DialogDescription>{props.root}</DialogDescription>
      </DialogHeader>
      <form
        className="flex min-h-0 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <DialogBody className="stack block">
          <label className="stack">
            Name of the design system
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="for example Oblique"
            />
          </label>
          <p className="field-note">
            Shown in the project list. It does not come from the folder name.
          </p>
          <label className="stack">
            Documentation folder
            <Input
              value={documentationDir}
              onChange={(e) => setDocumentationDir(e.target.value)}
              placeholder="documentation"
            />
          </label>
          <p className="field-note">
            The DSDS documents go here, relative to the folder. It is created if missing. Saved
            versions cover this folder only. Use <code>.</code> for the folder itself.
          </p>
          {choices('Documents found in', found?.documentationDirs ?? [], setDocumentationDir)}
          <label className="stack">
            Token folder (optional)
            <Input value={tokensDir} onChange={(e) => setTokensDir(e.target.value)} />
          </label>
          {choices('Tokens found in', found?.tokenDirs ?? [], setTokensDir)}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={linkTokens}
              onCheckedChange={(v) => setLinkTokens(v === true)}
              className="mt-0.5"
              aria-label="Link the tokens into the documentation folder"
            />
            <span>
              Link the tokens into the documentation folder
              <span className="block text-xs text-muted-foreground">
                Adds a link <code>tokens/</code> in the documentation folder, so a source such as{' '}
                <code>./tokens/color.json#/color/red</code> can be checked by the validator. It is
                the only thing outside your documents that Studio creates.
              </span>
            </span>
          </label>
          {error ? <p className="field-note field-note--error">{error}</p> : null}
        </DialogBody>
        <DialogFooter className="justify-start">
          <Button type="button" variant="secondary" onClick={props.onBack}>
            Back
          </Button>
          <Button type="submit" disabled={busy || !found || !name.trim()}>
            Open folder
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
