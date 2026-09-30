import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Sender } from '../api/types';
import { useDashboard } from '../context/DashboardContext';
import { formatFullDate, htmlToText } from '../lib/format';
import { RecipientsField } from '../components/compose/RecipientsField';
import { RichTextEditor } from '../components/compose/RichTextEditor';
import { SendLaterPopover } from '../components/compose/SendLaterPopover';
import { Button, IconButton } from '../components/ui/Button';
import { ArrowLeftIcon, ChevronDownIcon, PaperclipIcon } from '../components/ui/Icons';
import { FieldRow, Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';

export function ComposePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshCounts } = useDashboard();

  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('');
  const [hourlyLimit, setHourlyLimit] = useState('');
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .senders()
      .then(({ senders }) => {
        setSenders(senders);
        if (senders[0]) setSenderId(senders[0].id);
      })
      .catch((err) => toast.error(`Couldn't load senders: ${(err as Error).message}`));
  }, [toast]);

  const selectedSender = senders.find((s) => s.id === senderId);

  const validate = (): string | null => {
    if (!senderId) return 'Pick a sender';
    if (!recipients.length) return 'Add at least one recipient or upload a lead list';
    if (!subject.trim()) return 'Subject is required';
    if (!htmlToText(body)) return 'Email body is empty';
    if (startAt && startAt.getTime() < Date.now() - 60_000) return 'Start time is in the past';
    return null;
  };

  const onSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const problem = validate();
    if (problem) return toast.error(problem);

    setSubmitting(true);
    try {
      const { scheduledCount } = await api.createCampaign({
        senderId,
        subject: subject.trim(),
        body,
        recipients,
        startAt: (startAt ?? new Date()).toISOString(),
        delaySeconds: Number(delaySeconds) || 0,
        hourlyLimit: Number(hourlyLimit) || 0,
      });
      toast.success(`${scheduledCount} email${scheduledCount === 1 ? '' : 's'} scheduled`);
      void refreshCounts();
      navigate('/scheduled');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex min-h-full flex-col px-6 py-5">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeftIcon size={20} />
        </IconButton>
        <h1 className="flex-1 text-xl font-medium text-neutral-900">Compose New Email</h1>
        {startAt && <span className="text-xs text-neutral-500">Starts {formatFullDate(startAt.toISOString())}</span>}
        <IconButton label="Upload lead list" onClick={() => document.getElementById('leads-file')?.click()}>
          <PaperclipIcon size={18} />
        </IconButton>
        <SendLaterPopover value={startAt} onChange={setStartAt} />
        <Button type="submit" variant="outline" rounded="full" loading={submitting} className="px-6">
          {startAt ? 'Schedule' : 'Send'}
        </Button>
      </header>

      <div className="mx-auto mt-8 w-full max-w-3xl space-y-4">
        <FieldRow label="From" htmlFor="from">
          <div className="relative inline-flex">
            <select
              id="from"
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="h-9 cursor-pointer appearance-none rounded-lg bg-surface pr-9 pl-3 text-sm text-neutral-800 outline-none"
            >
              {senders.length === 0 && <option value="">Loading senders…</option>}
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.email}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500" />
          </div>
          {selectedSender && (
            <span className="ml-3 text-xs text-neutral-400">
              {selectedSender.name} · max {selectedSender.hourlyLimit}/hour
            </span>
          )}
        </FieldRow>

        <FieldRow label="To" htmlFor="to">
          <RecipientsField
            recipients={recipients}
            onChange={setRecipients}
            fileName={fileName}
            onFileName={setFileName}
            onError={toast.error}
          />
        </FieldRow>

        <FieldRow label="Subject" htmlFor="subject">
          <Input id="subject" variant="underline" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </FieldRow>

        <div className="flex flex-wrap items-center gap-6 pt-1">
          <label className="flex items-center gap-3 whitespace-nowrap text-sm text-neutral-700">
            Delay between 2 emails
            <Input
              variant="box"
              type="number"
              min={0}
              placeholder="00"
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(e.target.value)}
              aria-describedby="delay-hint"
            />
            <span id="delay-hint" className="text-xs text-neutral-400">sec</span>
          </label>
          <label className="flex items-center gap-3 whitespace-nowrap text-sm text-neutral-700">
            Hourly Limit
            <Input variant="box" type="number" min={0} placeholder="00" value={hourlyLimit} onChange={(e) => setHourlyLimit(e.target.value)} />
            <span className="text-xs text-neutral-400">0 = sender limit only</span>
          </label>
        </div>

        <RichTextEditor value={body} onChange={setBody} />
      </div>
    </form>
  );
}
