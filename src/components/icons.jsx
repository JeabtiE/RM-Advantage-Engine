// icons.jsx — the whole icon set, as inline SVG.
//
// WHY NOT A LIBRARY: the app needs about a dozen glyphs. lucide-react, the
// lightest reasonable option, is ~30KB gzipped of dependency plus a tree-shaking
// story that only works if the bundler cooperates; these hand-written paths cost
// under 2KB in the bundle and nothing at runtime. Hard constraint #5 (the demo
// must not depend on anything it doesn't control) points the same way.
//
// HOUSE RULES, so a new icon can't drift from the set:
//   - 24x24 viewBox, 1.5 stroke, round caps/joins, no fill.
//   - stroke="currentColor" ONLY. An icon never names a colour; it inherits the
//     text colour of whatever it sits in, so the token system stays in charge.
//   - size is a prop, default 16 (matches the caption line-height).
//   - aria-hidden by default: icons here are decorative. An icon-only CONTROL
//     carries the accessible name on the <button> (aria-label + title), never on
//     the glyph — see IconButton in ui.jsx.

const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

function Svg({ size = 16, children, className = "", ...rest }) {
  return (
    <svg
      {...BASE}
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {children}
    </svg>
  );
}

// --- Destinations (the segmented bar) --------------------------------------

// Approval — a shield with a check. Reads as "gate", not "done".
export const IconApproval = (p) => (
  <Svg {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.3 3 8.3 7.5 9.5 4.5-1.2 7.5-5.2 7.5-9.5V6L12 3Z" />
    <path d="m9 11.8 2.1 2.1L15.2 9.8" />
  </Svg>
);

// Affected clients — two figures.
export const IconClients = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M16.2 5.3a3.2 3.2 0 0 1 0 5.9" />
    <path d="M17.8 14.6a5.5 5.5 0 0 1 2.7 4.9" />
  </Svg>
);

// Scripts — a speech bubble with lines (what the RM reads on a call).
export const IconScripts = (p) => (
  <Svg {...p}>
    <path d="M20.5 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.3-5.2A7.5 7.5 0 1 1 20.5 12.5Z" />
    <path d="M8.8 10.5h6.4M8.8 14h4" />
  </Svg>
);

// --- Controls ---------------------------------------------------------------

export const IconChevronDown = (p) => (
  <Svg {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Svg>
);

export const IconChevronRight = (p) => (
  <Svg {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Svg>
);

export const IconCopy = (p) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 5.8A2.5 2.5 0 0 0 12.6 4H6.5A2.5 2.5 0 0 0 4 6.5v6.1A2.5 2.5 0 0 0 5.8 15" />
  </Svg>
);

export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const IconRefresh = (p) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4.5V10h-5.5" />
  </Svg>
);

export const IconExternal = (p) => (
  <Svg {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" />
  </Svg>
);

export const IconClose = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconFilter = (p) => (
  <Svg {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Svg>
);

// --- Status glyphs (left rail) ---------------------------------------------

// Not analyzed — a hollow ring. Deliberately the quietest of the four.
export const IconDotEmpty = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="6" />
  </Svg>
);

// Analyzed, pending review — a clock.
export const IconPending = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Svg>
);

// Approved — a check in a circle.
export const IconApproved = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.4 12.2 2.5 2.5 4.7-4.9" />
  </Svg>
);

// Rejected — a slash in a circle. Distinct in SHAPE from approved, not only
// in colour, so the rail is readable without relying on green vs red.
export const IconRejected = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.6 15.4 15.4 8.6" />
  </Svg>
);

// Warning — used for error rows and the truncation notice.
export const IconWarning = (p) => (
  <Svg {...p}>
    <path d="M12 4.5 21 19.5H3L12 4.5Z" />
    <path d="M12 10v4" />
    <path d="M12 16.6v.4" />
  </Svg>
);
