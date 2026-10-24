import type { ReactNode } from "react";
import type { Tool } from "./tools";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const TOOL_ICONS: Record<Tool, ReactNode> = {
  select: (
    <Icon>
      <path d="M5 3l14 8-6 1.5L10 19z" />
    </Icon>
  ),
  hand: (
    <Icon>
      <path d="M8 12V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v7.5c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 012.5-1.5L8 13" />
    </Icon>
  ),
  pen: (
    <Icon>
      <path d="M4 20l1-4L16 5l3 3L8 19z" />
      <path d="M14 7l3 3" />
    </Icon>
  ),
  line: (
    <Icon>
      <path d="M5 19L19 5" />
    </Icon>
  ),
  rect: (
    <Icon>
      <rect x="4" y="6" width="16" height="12" rx="1.5" />
    </Icon>
  ),
  ellipse: (
    <Icon>
      <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
    </Icon>
  ),
  text: (
    <Icon>
      <path d="M5 6V4h14v2M12 4v16M9 20h6" />
    </Icon>
  ),
  eraser: (
    <Icon>
      <path d="M16 4l5 5-10 10H6l-3-3z" />
      <path d="M11 9l5 5M6 19h14" />
    </Icon>
  ),
  token: (
    <Icon>
      <circle cx="12" cy="10" r="6.5" />
      <path d="M6 20h12" />
    </Icon>
  ),
  calibrate: (
    <Icon>
      <rect x="6" y="6" width="12" height="12" strokeDasharray="3 2" />
      <path d="M3 3l3 3M21 21l-3-3" />
    </Icon>
  ),
  terrain: (
    <Icon>
      <path d="M3 18c3-1 4-5 7-5s4 3 7 3 3-2 4-2" />
      <path d="M5 10l3-4 3 4M14 9l2-3 3 4" />
    </Icon>
  ),
  path: (
    <Icon>
      <path d="M7 21c0-5 10-6 10-11 0-3-3-5-6-5" />
      <path d="M11 21c0-3 6-4 8-8" strokeDasharray="2 2" />
    </Icon>
  ),
  wall: (
    <Icon>
      <path d="M4 20V5l8-2 8 2v15M4 10h16M4 15h16M9 4v6m6-6v6M7 10v5m10-5v5M9 15v5m6-5v5" />
    </Icon>
  ),
  light: (
    <Icon>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0012 3z" />
    </Icon>
  ),
  stamp: (
    <Icon>
      <circle cx="9" cy="9" r="5" />
      <circle cx="16.5" cy="14.5" r="3.5" />
      <path d="M9 14v6M16.5 18v2" />
    </Icon>
  ),
  fog: (
    <Icon>
      <path d="M4 9h11a3 3 0 100-3M3 13h15a3 3 0 110 3M6 17h7" />
    </Icon>
  ),
};

export const ImageIcon = (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-9 9" />
  </Icon>
);

export const UndoIcon = (
  <Icon>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 010 12h-3" />
  </Icon>
);

export const RedoIcon = (
  <Icon>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 000 12h3" />
  </Icon>
);

export const FitIcon = (
  <Icon>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
);

export const TokenIcon = (
  <Icon>
    <circle cx="12" cy="10" r="6.5" />
    <path d="M6 20h12" />
  </Icon>
);

export const GridIcon = (
  <Icon>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
    <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
  </Icon>
);

export const LockIcon = (
  <Icon>
    <rect x="5" y="11" width="14" height="9" rx="1.5" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Icon>
);

export const UnlockIcon = (
  <Icon>
    <rect x="5" y="11" width="14" height="9" rx="1.5" />
    <path d="M8 11V8a4 4 0 017.5-2" />
  </Icon>
);

export const TrashIcon = (
  <Icon>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Icon>
);

export const EyeIcon = (
  <Icon>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = (
  <Icon>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.2M6.6 6.6A17 17 0 002 12s3.5 7 10 7a9.7 9.7 0 005.4-1.6" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </Icon>
);

export const SettingsIcon = (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Icon>
);

export const InfoIcon = (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </Icon>
);
