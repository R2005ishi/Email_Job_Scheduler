import { useEffect, useRef } from 'react';
import { IconButton } from '../ui/Button';
import {
  AlignIcon,
  BoldIcon,
  IndentIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  OutdentIcon,
  QuoteIcon,
  RedoIcon,
  StrikeIcon,
  TextSizeIcon,
  UnderlineIcon,
  UndoIcon,
} from '../ui/Icons';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

type Tool = { label: string; icon: React.ReactNode; run: () => void } | 'divider';

const exec = (command: string, arg?: string) => document.execCommand(command, false, arg);

// Simple rich text editor using contentEditable + execCommand (no extra library)
export function RichTextEditor({ value, onChange, placeholder = 'Type Your Reply...' }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  // only overwrite the DOM when the value changed from outside, otherwise the cursor jumps
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value]);

  const emit = () => onChange(ref.current?.innerHTML ?? '');

  const tools: Tool[] = [
    { label: 'Undo', icon: <UndoIcon />, run: () => exec('undo') },
    { label: 'Redo', icon: <RedoIcon />, run: () => exec('redo') },
    'divider',
    { label: 'Heading', icon: <TextSizeIcon />, run: () => exec('formatBlock', 'h3') },
    'divider',
    { label: 'Bold', icon: <BoldIcon />, run: () => exec('bold') },
    { label: 'Italic', icon: <ItalicIcon />, run: () => exec('italic') },
    { label: 'Underline', icon: <UnderlineIcon />, run: () => exec('underline') },
    'divider',
    { label: 'Align', icon: <AlignIcon />, run: () => exec('justifyCenter') },
    'divider',
    { label: 'Numbered list', icon: <ListOrderedIcon />, run: () => exec('insertOrderedList') },
    { label: 'Bullet list', icon: <ListIcon />, run: () => exec('insertUnorderedList') },
    { label: 'Indent', icon: <IndentIcon />, run: () => exec('indent') },
    { label: 'Outdent', icon: <OutdentIcon />, run: () => exec('outdent') },
    { label: 'Quote', icon: <QuoteIcon />, run: () => exec('formatBlock', 'blockquote') },
    'divider',
    { label: 'Strikethrough', icon: <StrikeIcon />, run: () => exec('strikeThrough') },
  ];

  return (
    <div className="rounded-xl bg-surface p-4">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label="Email body"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className="editor mb-3 min-h-8 text-sm text-neutral-800 outline-none"
      />
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-white px-2 py-1 shadow-sm w-fit">
        {tools.map((tool, i) =>
          tool === 'divider' ? (
            <span key={i} className="mx-1 h-5 w-px bg-neutral-200" />
          ) : (
            <IconButton
              key={tool.label}
              label={tool.label}
              onMouseDown={(e) => e.preventDefault()} // keep the selection inside the editor
              onClick={() => {
                tool.run();
                emit();
              }}
            >
              {tool.icon}
            </IconButton>
          ),
        )}
      </div>
      <div className="min-h-64 cursor-text" onClick={() => ref.current?.focus()} />
    </div>
  );
}
