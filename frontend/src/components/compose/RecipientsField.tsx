import { KeyboardEvent, useRef, useState } from 'react';
import { extractEmails } from '../../lib/leads';
import { UploadIcon, XIcon } from '../ui/Icons';

interface RecipientsFieldProps {
  recipients: string[];
  onChange: (recipients: string[]) => void;
  fileName: string | null;
  onFileName: (name: string | null) => void;
  onError: (message: string) => void;
}

const MAX_CHIPS = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// "To" field: type emails, or upload a CSV/TXT file of leads
export function RecipientsField({ recipients, onChange, fileName, onFileName, onError }: RecipientsFieldProps) {
  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const addFromText = (text: string) => {
    const found = extractEmails(text);
    if (!found.length) return false;
    onChange([...new Set([...recipients, ...found])]);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && draft.trim()) {
      e.preventDefault();
      if (addFromText(draft)) setDraft('');
      else onError(`"${draft}" is not a valid email address`);
    } else if (e.key === 'Backspace' && !draft && recipients.length) {
      onChange(recipients.slice(0, -1));
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return onError('File is larger than 5 MB');
    const text = await file.text();
    const found = extractEmails(text);
    if (!found.length) return onError(`No email addresses found in ${file.name}`);
    onChange([...new Set([...recipients, ...found])]);
    onFileName(file.name);
  };

  const clearAll = () => {
    onChange([]);
    onFileName(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const hidden = recipients.length - MAX_CHIPS;

  return (
    <div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 border-b border-neutral-200 py-1.5 focus-within:border-brand-500">
        {recipients.slice(0, MAX_CHIPS).map((r) => (
          <span key={r} className="inline-flex items-center gap-1 rounded-full border border-brand-500 bg-brand-50 px-2.5 py-0.5 text-xs text-neutral-800">
            {r}
            <button
              type="button"
              aria-label={`Remove ${r}`}
              className="cursor-pointer text-neutral-400 hover:text-neutral-700"
              onClick={() => onChange(recipients.filter((x) => x !== r))}
            >
              <XIcon size={11} />
            </button>
          </span>
        ))}
        {hidden > 0 && (
          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">+{hidden}</span>
        )}
        <input
          id="to"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && addFromText(draft) && setDraft('')}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (extractEmails(text).length > 1) {
              e.preventDefault();
              addFromText(text);
            }
          }}
          placeholder={recipients.length ? '' : 'recipient@example.com'}
          className="min-w-40 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-500"
        >
          <UploadIcon size={15} /> Upload List
        </button>
        <input
          ref={fileRef}
          id="leads-file"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>

      {recipients.length > 0 && (
        <p className="mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
          <span className="font-medium text-brand-600">
            {recipients.length} email address{recipients.length === 1 ? '' : 'es'} detected
          </span>
          {fileName && <span>from {fileName}</span>}
          <button type="button" onClick={clearAll} className="cursor-pointer text-neutral-400 underline hover:text-neutral-600">
            clear
          </button>
        </p>
      )}
    </div>
  );
}
