import { useEffect, useState } from 'react';
import { ProjectPicker } from './ProjectPicker';
import { ProjectView } from './ProjectView';

const readHash = () => (location.hash.startsWith('#/p/') ? location.hash.slice(4) : null);

export function App() {
  const [slug, setSlug] = useState<string | null>(readHash);

  useEffect(() => {
    const onHash = () => setSlug(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const open = (s: string | null) => {
    location.hash = s ? `#/p/${s}` : '';
    setSlug(s);
  };

  return slug ? (
    <ProjectView key={slug} slug={slug} onBack={() => open(null)} />
  ) : (
    <ProjectPicker onOpen={open} />
  );
}
