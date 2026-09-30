import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** Minimal stroke-icon factory so every icon shares size/stroke defaults. */
const icon = (paths: React.ReactNode) =>
  function Icon({ size = 16, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        {paths}
      </svg>
    );
  };

export const ClockIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const SendIcon = icon(<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />);
export const SearchIcon = icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const FilterIcon = icon(<path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5Z" />);
export const RefreshIcon = icon(<><path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" /></>);
export const StarIcon = icon(<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" />);
export const ArrowLeftIcon = icon(<path d="M19 12H5m6-6-6 6 6 6" />);
export const PaperclipIcon = icon(<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7L10.2 17a1.7 1.7 0 0 1-2.4-2.4L15.5 7" />);
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />);
export const ChevronUpDownIcon = icon(<path d="m7 15 5 5 5-5M7 9l5-5 5 5" />);
export const ArchiveIcon = icon(<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></>);
export const TrashIcon = icon(<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />);
export const UndoIcon = icon(<path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />);
export const RedoIcon = icon(<path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />);
export const BoldIcon = icon(<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7V5Zm0 7h7a3.5 3.5 0 0 1 0 7H7v-7Z" />);
export const ItalicIcon = icon(<path d="M19 4h-9M14 20H5M15 4 9 20" />);
export const UnderlineIcon = icon(<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16" />);
export const StrikeIcon = icon(<path d="M4 12h16M16 6.5A4 4 0 0 0 12 5c-2.5 0-4 1.3-4 3 0 3.5 8 2.5 8 7 0 1.8-1.7 3-4 3a4.5 4.5 0 0 1-4.5-2.5" />);
export const ListIcon = icon(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />);
export const ListOrderedIcon = icon(<path d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4.5 14.5a1 1 0 0 1 1.5 1c0 .8-2 1.5-2 3h2" />);
export const QuoteIcon = icon(<path d="M7 7h4v6H5V9a2 2 0 0 1 2-2Zm0 6v4M17 7h4v6h-6V9a2 2 0 0 1 2-2Zm0 6v4" />);
export const AlignIcon = icon(<path d="M4 6h16M7 12h10M4 18h16" />);
export const IndentIcon = icon(<path d="M9 6h11M9 12h11M9 18h11M3 9l3 3-3 3" />);
export const OutdentIcon = icon(<path d="M9 6h11M9 12h11M9 18h11M6 9l-3 3 3 3" />);
export const TextSizeIcon = icon(<path d="M4 7V5h10v2M9 5v14M13 13v-1h7v1M16.5 12v7" />);
export const UploadIcon = icon(<path d="M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />);
export const LogOutIcon = icon(<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />);
export const CalendarIcon = icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const InboxIcon = icon(<path d="M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2-8Z" />);
export const XIcon = icon(<path d="M18 6 6 18M6 6l12 12" />);
export const CheckIcon = icon(<path d="m5 12 5 5 9-10" />);
export const AlertIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>);
export const BoltIcon = icon(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />);
export const ExternalIcon = icon(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />);

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function SlackIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#E01E5A" d="M5 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Z" />
      <path fill="#36C5F0" d="M9 5a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Z" />
      <path fill="#2EB67D" d="M19 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Z" />
      <path fill="#ECB22E" d="M15 19a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
    </svg>
  );
}
