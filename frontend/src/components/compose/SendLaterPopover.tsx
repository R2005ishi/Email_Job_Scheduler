import { useEffect, useState } from 'react';
import { toDateTimeLocal } from '../../lib/format';
import { Button, IconButton } from '../ui/Button';
import { ClockIcon } from '../ui/Icons';
import { Popover } from '../ui/Popover';

interface SendLaterPopoverProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
}

const tomorrowAt = (h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d;
};

const PRESETS = [
  { label: 'Tomorrow', get: () => tomorrowAt(9) },
  { label: 'Tomorrow, 10:00 AM', get: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', get: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', get: () => tomorrowAt(15) },
];

/** "Send Later" panel from the Figma: date-time picker + quick presets. */
export function SendLaterPopover({ value, onChange }: SendLaterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open) setDraft(value ? toDateTimeLocal(value) : '');
  }, [open, value]);

  const apply = () => {
    onChange(draft ? new Date(draft) : null);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      className="w-80 p-4"
      trigger={
        <IconButton label="Send later" active={Boolean(value)} onClick={() => setOpen((o) => !o)}>
          <ClockIcon size={18} />
        </IconButton>
      }
    >
      <h3 className="text-sm font-semibold text-neutral-900">Send Later</h3>
      <input
        type="datetime-local"
        value={draft}
        min={toDateTimeLocal(new Date())}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Pick date & time"
        className="mt-3 h-9 w-full border-b border-neutral-200 text-sm text-neutral-700 outline-none focus:border-brand-500"
      />
      <ul className="mt-3 space-y-1">
        {PRESETS.map((p) => (
          <li key={p.label}>
            <button
              type="button"
              onClick={() => setDraft(toDateTimeLocal(p.get()))}
              className="w-full cursor-pointer rounded-md px-1 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-end gap-2">
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Send now instead
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button variant="outline" size="sm" rounded="full" onClick={apply} disabled={!draft}>
          Done
        </Button>
      </div>
    </Popover>
  );
}
