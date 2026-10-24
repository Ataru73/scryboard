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
