import { ReactNode, useRef } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

/** Anchored floating panel that closes on outside click / Escape. */
export function Popover({ open, onClose, trigger, children, align = 'right', className = '' }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose, open);

  return (
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {trigger}
      {open && (
        <div
          className={`absolute top-full z-30 mt-2 rounded-xl border border-neutral-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
