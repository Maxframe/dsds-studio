import { ConfirmButton } from '../ConfirmButton';
import { IconButton } from '../IconButton';
import { useForm } from './context';

const hasContent = (v: unknown) =>
  Array.isArray(v)
    ? v.length > 0
    : v !== null && typeof v === 'object' && Object.keys(v).length > 0;

/**
 * Removes an optional field from the document. A plain ✕ for a simple value; a field that holds
 * nested content (a list, a group of fields) asks for confirmation first.
 */
export function RemoveField({
  pointer,
  label,
  value,
}: {
  pointer: string;
  label: string;
  value: unknown;
}) {
  const ctx = useForm();
  const remove = () => void ctx.apply([{ op: 'remove', pointer }]);
  const name = `Remove ${label}`;
  if (hasContent(value)) {
    return (
      <ConfirmButton
        compact
        className="field-remove"
        label={name}
        hint={`Removes ${label} and everything in it`}
        onConfirm={remove}
      />
    );
  }
  return (
    <IconButton
      variant="ghost"
      size="icon-xs"
      className="field-remove"
      label={name}
      onClick={remove}
    >
      ✕
    </IconButton>
  );
}
