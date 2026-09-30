import { forwardRef, InputHTMLAttributes } from 'react';

type Variant = 'filled' | 'underline' | 'box';

const variants: Record<Variant, string> = {
  filled: 'h-11 rounded-lg bg-surface px-4 placeholder:text-neutral-400 focus:ring-2 focus:ring-brand-500/30',
  underline: 'h-10 border-b border-neutral-200 bg-transparent px-0 placeholder:text-neutral-400 focus:border-brand-500',
  box: 'h-9 w-16 rounded-md border border-neutral-200 px-2 text-center placeholder:text-neutral-400 focus:border-brand-500',
};

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: Variant;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant = 'filled', className = '', ...rest },
  ref,
) {
  const width = variant === 'box' ? '' : 'w-full';
  return <input ref={ref} className={`${width} text-sm outline-none transition ${variants[variant]} ${className}`} {...rest} />;
});

/** Label-on-the-left row used by the compose form (From / To / Subject ...). */
export function FieldRow({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center gap-4">
      <label htmlFor={htmlFor} className="w-16 shrink-0 text-sm text-neutral-700">
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
