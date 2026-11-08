import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Open a Radix Select (or any combobox button) and return the labels of its options. */
export async function optionsOf(user: UserEvent, trigger: HTMLElement): Promise<string[]> {
  await user.click(trigger);
  return within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent ?? '');
}

/** Open a Radix Select and choose the option with this name. */
export async function choose(user: UserEvent, trigger: HTMLElement, name: string) {
  await user.click(trigger);
  await user.click(within(screen.getByRole('listbox')).getByRole('option', { name }));
}
