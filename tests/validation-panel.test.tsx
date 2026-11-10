// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Finding, ValidationResult } from '@shared/types';
import { ValidationPanel } from '../src/web/ValidationPanel';

afterEach(cleanup);

const finding = (over: Partial<Finding>): Finding => ({
  rule: 'DSDS-15',
  severity: 'warning',
  pointer: '/sections',
  message: 'component has no when-to-use section',
  fix: 'Add a guidelines section.',
  docs: null,
  ...over,
});
const result = (over: Partial<ValidationResult>): ValidationResult => ({
  ok: true,
  errors: 0,
  warnings: 0,
  findings: [],
  packVersion: '0.23.1',
  ...over,
});

describe('ValidationPanel advice', () => {
  it('lists advice under its own heading without changing the counts', () => {
    render(<ValidationPanel result={result({ advice: [finding({})] })} onJump={() => {}} />);
    expect(screen.getByText(/0 errors, 0 warnings/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Advice · 1' })).toBeTruthy();
    expect(screen.getByText('component has no when-to-use section')).toBeTruthy();
  });

  it('has no advice section when there is none', () => {
    render(<ValidationPanel result={result({ advice: [] })} onJump={() => {}} />);
    expect(screen.queryByRole('heading', { name: /Advice/ })).toBeNull();
    expect(screen.getByText('All good.')).toBeTruthy();
  });

  it('jumps to the field an advice item points at', async () => {
    const onJump = vi.fn();
    const f = finding({});
    render(<ValidationPanel result={result({ advice: [f] })} onJump={onJump} />);
    await userEvent.click(screen.getByRole('button', { name: /no when-to-use section/ }));
    expect(onJump).toHaveBeenCalledWith(f);
  });
});
