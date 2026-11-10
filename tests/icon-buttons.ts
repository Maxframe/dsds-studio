/**
 * Icon buttons are buttons with no words of their own: an icon, or one symbol like ↑ ✕ +. Each must
 * have an accessible name and a hover hint: our `IconButton` (a shadcn tooltip, marked with
 * `data-tooltip`), or a native `title` where a floating tooltip does not fit (inside a text field).
 */
const SYMBOL = /^[↑↓✕✖×+▾▸▴◂▸]$/;

export function iconOnlyButtons(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button')].filter((b) => {
    const text = (b.textContent ?? '').replace(/\s+/g, '');
    return text === '' || SYMBOL.test(text);
  });
}

/** The icon buttons that lack a name or a hover hint, described for a failure message. */
export function iconButtonsMissingHints(root: ParentNode = document): string[] {
  return iconOnlyButtons(root)
    .filter((b) => {
      const name = b.getAttribute('aria-label')?.trim();
      const hint = b.getAttribute('data-tooltip') ?? b.getAttribute('title');
      return !name || !hint;
    })
    .map((b) => b.outerHTML.replace(/\s+/g, ' ').slice(0, 140));
}
