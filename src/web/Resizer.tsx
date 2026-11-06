import type { KeyboardEvent, PointerEvent } from 'react';

const MIN = 160;
const STEP = 16;

/**
 * A draggable divider between two columns. `side` says which pane it resizes: the one before it
 * (`left`) or the one after it (`right`). It measures that pane, so the caller only stores the
 * resulting width.
 */
export function Resizer(props: {
  side: 'left' | 'right';
  label: string;
  onResize(px: number): void;
}) {
  const { side, label, onResize } = props;
  const pane = (el: HTMLElement) =>
    (side === 'left' ? el.previousElementSibling : el.nextElementSibling) as HTMLElement | null;
  const clamp = (px: number) => Math.max(MIN, Math.min(px, window.innerWidth / 2));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const target = pane(e.currentTarget);
    if (!target) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = target.getBoundingClientRect().width;
    const move = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - startX;
      onResize(clamp(side === 'left' ? startW + dx : startW - dx));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const target = pane(e.currentTarget);
    if (!target) return;
    e.preventDefault();
    const dir = (e.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1);
    onResize(clamp(target.getBoundingClientRect().width + dir * STEP));
  };

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
