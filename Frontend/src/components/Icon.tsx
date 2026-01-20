interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export type IconName =
  | 'mapPin'
  | 'bolt'
  | 'leaf'
  | 'gauge'
  | 'target'
  | 'search'
  | 'car'
  | 'clock'
  | 'wallet'
  | 'compass'
  | 'close'
  | 'plug'
  | 'battery'
  | 'coffee'
  | 'restroom'
  | 'wifi'
  | 'store'
  | 'restaurant'
  | 'parking'
  | 'lounge'
  | 'mic'
  | 'stop'
  | 'spark'
  | 'chat'
  | 'send'
  | 'route';

export function Icon({ name, size = 18, strokeWidth = 1.6, className }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: ['icon', className].filter(Boolean).join(' '),
    'aria-hidden': true
  };

  switch (name) {
    case 'mapPin':
      return (
        <svg {...common}>
          <path d="M12 22s7-6.5 7-12.5A7 7 0 0 0 5 9.5C5 15.5 12 22 12 22Z" />
          <circle cx="12" cy="9.5" r="3.5" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...common}>
          <path d="M13 2 5 14h6l-1 8 8-12h-6Z" />
        </svg>
      );
    case 'leaf':
      return (
        <svg {...common}>
          <path d="M4 20c8.5 0 14-5.5 14-14v0S9.5 6 4 11.5 4 20 4 20Z" />
          <path d="M10 8c-2 2-3.5 4-4 6" />
        </svg>
      );
    case 'gauge':
      return (
        <svg {...common}>
          <path d="M12 16v0" />
          <path d="M12 16 8 12" />
          <path d="M5.8 5.8A9 9 0 1 1 18.2 18.2 9 9 0 0 1 5.8 5.8Z" />
        </svg>
      );
    case 'target':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'car':
      return (
        <svg {...common}>
          <path d="M3 13h18l-1.5-5.5a2 2 0 0 0-2-1.5H6.5a2 2 0 0 0-2 1.5Z" />
          <path d="M5 13v3" />
          <path d="M19 13v3" />
          <circle cx="7" cy="17" r="1.3" />
          <circle cx="17" cy="17" r="1.3" />
          <path d="M3 15h-1v-2h1Z" />
          <path d="M21 15h1v-2h-1Z" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...common}>
          <path d="M4 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
          <path d="M16 12h4" />
          <circle cx="16" cy="12" r="0.8" />
        </svg>
      );
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m9 15 2-6 6-2-2 6Z" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M18 6 6 18" />
          <path d="M6 6l12 12" />
        </svg>
      );
    case 'plug':
      return (
        <svg {...common}>
          <path d="M9 2v4" />
          <path d="M15 2v4" />
          <path d="M5 8h14v3a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5Z" />
          <path d="M12 16v6" />
        </svg>
      );
    case 'battery':
      return (
        <svg {...common}>
          <rect x="4" y="8" width="14" height="8" rx="2" />
          <path d="M18 10h2v4h-2Z" />
          <path d="M6 12h6" />
        </svg>
      );
    case 'coffee':
      return (
        <svg {...common}>
          <path d="M3 8h13a3 3 0 0 1 0 6H3Z" />
          <path d="M16 10h2a2 2 0 0 1 0 4h-2" />
          <path d="M6 2s-.5 1.5 1 3" />
          <path d="M10 2s-.5 1.5 1 3" />
          <path d="M14 2s-.5 1.5 1 3" />
          <path d="M5 14v2a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-2" />
        </svg>
      );
    case 'restroom':
      return (
        <svg {...common}>
          <circle cx="8" cy="5" r="2" />
          <circle cx="16" cy="5" r="2" />
          <path d="M6 22v-7l-2-3h8l-2 3v7" />
          <path d="M14 22V9h4v13" />
        </svg>
      );
    case 'wifi':
      return (
        <svg {...common}>
          <path d="M2 9a16 16 0 0 1 20 0" />
          <path d="M5 12a11 11 0 0 1 14 0" />
          <path d="M8.5 15a6 6 0 0 1 7 0" />
          <circle cx="12" cy="18" r="0.8" />
        </svg>
      );
    case 'store':
      return (
        <svg {...common}>
          <path d="M3 9h18l-2-5H5Z" />
          <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
          <path d="M9 9v11" />
          <path d="M15 9v4h5" />
        </svg>
      );
    case 'restaurant':
      return (
        <svg {...common}>
          <path d="M4 3v7a3 3 0 0 0 6 0V3" />
          <path d="M4 9h6" />
          <path d="M12 3h4a2 2 0 0 1 2 2v17" />
          <path d="M12 9h6" />
        </svg>
      );
    case 'parking':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 16V8h4.5a2.5 2.5 0 0 1 0 5H9Z" />
        </svg>
      );
    case 'lounge':
      return (
        <svg {...common}>
          <path d="M3 12h14a4 4 0 0 1 4 4v3H3Z" />
          <path d="M6 12V8a3 3 0 0 1 6 0v4" />
        </svg>
      );
    case 'mic':
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
          <path d="M12 19v3" />
          <path d="M8 22h8" />
        </svg>
      );
    case 'stop':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common}>
          <path d="M12 2v4" />
          <path d="m18 6-2 3" />
          <path d="m20 14-4-1" />
          <path d="m6 6 2 3" />
          <path d="m4 14 4-1" />
          <path d="m9 22 2-6 4 1-2 5Z" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M5 19v-2.5A7.5 7.5 0 0 1 12.5 9H14a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5H9.5Z" />
          <path d="M12 9a5 5 0 0 1-5-5v0" />
        </svg>
      );
    case 'send':
      return (
        <svg {...common}>
          <path d="m3 12 18-7-4 14-6-4-4 4Z" />
          <path d="M12 12 3 12" />
        </svg>
      );
    case 'route':
      return (
        <svg {...common}>
          <path d="M4 5h4a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h6" />
          <circle cx="6" cy="5" r="2" />
          <circle cx="18" cy="14" r="2" />
        </svg>
      );
    default:
      return null;
  }
}
