import type { Finding, ValidationResult } from '@shared/types';

export function ValidationPanel({
  result,
  onJump,
}: {
  result: ValidationResult | null | undefined;
  onJump(finding: Finding): void;
}) {
  if (!result)
    return <p className="muted">No validation result (no schema pack for this version).</p>;
  const advice = result.advice ?? [];
  return (
    <div>
      <h2 className="pane-title">
        Validation · {result.errors} error{result.errors === 1 ? '' : 's'}, {result.warnings}{' '}
        warning
        {result.warnings === 1 ? '' : 's'}
      </h2>
      <p className="muted">Checked with schema pack {result.packVersion}.</p>
      {result.findings.length === 0 ? <p>All good.</p> : null}
      <FindingList findings={result.findings} onJump={onJump} />
      {advice.length > 0 ? (
        <section aria-label="Advice">
          <h2 className="pane-title">Advice · {advice.length}</h2>
          <p className="muted">
            Editorial suggestions from the schema pack's lint. They never fail validation.
          </p>
          <FindingList findings={advice} onJump={onJump} />
        </section>
      ) : null}
    </div>
  );
}

function FindingList({
  findings,
  onJump,
}: {
  findings: Finding[];
  onJump(finding: Finding): void;
}) {
  return findings.map((f, i) => (
    <button key={i} type="button" className="finding" onClick={() => onJump(f)}>
      <span className={`badge badge--${f.severity}`}>{f.rule ?? f.severity}</span>{' '}
      <span>{f.message}</span>
      <div className="finding-where">{f.pointer || '(document)'}</div>
      {f.fix ? <div className="muted">{f.fix}</div> : null}
    </button>
  ));
}
