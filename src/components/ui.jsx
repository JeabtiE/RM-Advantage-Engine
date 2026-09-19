// ui.jsx — the shared presentation layer.
//
// WHY THIS FILE EXISTS: RISK_META, SENTIMENT_META and DIRECTION_META were
// hand-copied into the news view, ApprovalDashboard, ClientList and ScriptViewer.
// Four copies of a colour map drift — and after the token migration a drifted
// copy would silently reintroduce a hardcoded colour. One definition here, used
// everywhere, is what makes "nothing hardcodes a colour outside the tokens"
// enforceable.
//
// Phase 6.1: UI chrome is English. CONTENT stays in the language the pipeline
// produced it in — Agent 1's reasoning and sector reasons, Agent 2's issues, the
// CIO's rationale and the generated scripts are all still Thai, and rendering
// them inside English chrome is the point: the chrome is ours to write, the
// content is the model's and a translation layer would be a place for it to
// change meaning.

import { calculateImpactShare } from "../utils/matching.js";
import {
  IconApproved,
  IconCheck,
  IconDotEmpty,
  IconPending,
  IconRejected,
  IconWarning,
} from "./icons.jsx";

// --- Meta tables (single definition, shared by every view) -----------------

export const RISK_META = {
  conservative: { label: "Conservative" },
  moderate: { label: "Moderate" },
  aggressive: { label: "Aggressive" },
};

export const SENTIMENT_META = {
  positive: { label: "Positive", tone: "up" },
  negative: { label: "Negative", tone: "down" },
  neutral: { label: "Neutral", tone: "flat" },
};

// Direction is NEVER communicated by colour alone: every use renders the arrow
// AND the text label alongside the colour, so it survives a colour-blind judge
// and a washed-out projector.
export const DIRECTION_META = {
  positive: { arrow: "▲", label: "Expected positive", tone: "up" },
  negative: { arrow: "▼", label: "Expected negative", tone: "down" },
  neutral: { arrow: "–", label: "Expected neutral", tone: "flat" },
};

// event_scope → label + a one-line hint on hover (how widely clients match).
export const SCOPE_META = {
  systemic: {
    label: "Market-wide",
    hint: "Macro event — second-order sectors may be included",
  },
  sector: {
    label: "Sector",
    hint: "A single industry; no second-order sectors",
  },
  single_company: {
    label: "Single company",
    hint: "Matches only clients holding this stock — no sector expansion",
  },
};

// tone → token-backed classes. The ONLY place a semantic colour is resolved.
const TONE = {
  up: { text: "text-up", bg: "bg-up-dim", border: "border-up" },
  down: { text: "text-down", bg: "bg-down-dim", border: "border-down" },
  flat: { text: "text-flat", bg: "bg-flat-dim", border: "border-flat" },
  reported: {
    text: "text-reported",
    bg: "bg-reported-dim",
    border: "border-reported",
  },
  alert: { text: "text-alert", bg: "bg-alert-dim", border: "border-alert" },
};

export const toneClass = (tone, part = "text") =>
  (TONE[tone] ?? TONE.flat)[part];

export const riskLabel = (profile) =>
  (RISK_META[profile] ?? { label: profile }).label;

// --- Primitives ------------------------------------------------------------

// Section — a titled block. Replaces the old rounded-2xl white card: no border,
// no shadow; the title row and a hairline do the separating.
export function Section({ title, meta, action, children, className = "" }) {
  return (
    <section className={className}>
      {(title || meta || action) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-caption font-semibold tracking-[0.08em] uppercase text-text-3">
                {title}
              </h2>
            )}
            {meta && <p className="mt-1 text-caption text-text-3">{meta}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// Rows — the grouped-row container. One surface, hairlines BETWEEN rows only
// (last:border-0 on the child), which is the iOS inset-group pattern.
export function Rows({ children, className = "" }) {
  return (
    <ul className={`overflow-hidden rounded-card bg-surface ${className}`}>
      {children}
    </ul>
  );
}

export function Row({ children, className = "", ...rest }) {
  return (
    <li
      className={`border-b border-hairline last:border-b-0 ${className}`}
      {...rest}
    >
      {children}
    </li>
  );
}

// Tag — a small OUTLINED chip. Deliberately outlined, not filled: filled badges
// were the old design's noise, and an outline lets Key Account / risk / scope
// all coexist on one row without competing for attention.
export function Tag({ children, tone, title, className = "" }) {
  const border = tone ? toneClass(tone, "border") : "border-hairline-strong";
  const text = tone ? toneClass(tone, "text") : "text-text-2";
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-tag border px-1.5 py-px text-caption font-medium ${border} ${text} ${className}`}
    >
      {children}
    </span>
  );
}

// Pct — a percentage, right-aligned, tabular, with its unit underneath. This is
// the number the whole layout is built around, so it has exactly one rendering.
export function Pct({ value, unit = "of portfolio" }) {
  return (
    <div className="shrink-0 text-right">
      <p className="tnum text-lead font-semibold leading-none text-text">
        {value}%
      </p>
      <p className="mt-1 text-caption text-text-3">{unit}</p>
    </div>
  );
}

// Rank — small and dim, per the brief. Not a filled chip.
//
// inline-block is load-bearing: a plain inline <span> ignores a width, so when
// Rank is nested rather than sitting directly in a flex row (ClientList wraps it
// for baseline alignment) the fixed column collapses and a two-digit rank shunts
// the whole row right. Fixed width + right alignment is what keeps the names in
// one column from #1 to #10.
export function Rank({ n }) {
  return (
    <span className="tnum inline-block w-5 shrink-0 text-right text-caption text-text-3">
      {n}
    </span>
  );
}

// DirectionTag — arrow + label + colour, the three together. Used for sector
// impacts and anywhere a direction is shown on its own.
export function DirectionTag({ direction, children, title }) {
  const d = DIRECTION_META[direction] ?? DIRECTION_META.neutral;
  return (
    <Tag tone={d.tone} title={title ?? d.label}>
      <span aria-hidden="true">{d.arrow}</span>
      {children}
      <span className="sr-only">{d.label}</span>
    </Tag>
  );
}

// ReportedFigure — a figure the SOURCE actually reported (SET +1.32%), as
// opposed to an expected-impact direction. It gets the one accent colour
// reserved for observed market data plus an explicit "Reported" label, so a
// green ▲ on a sector and a real +1.32% can never be read as the same kind of
// claim. The pairing is deliberate and must survive any copy change:
//   "Expected impact (theoretical)"  → arrows, green/red, Agent 1's view
//   "Reported"                       → blue, a figure the news actually stated
export function ReportedFigure({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-tag bg-reported-dim px-1.5 py-px align-middle">
      <span className="text-caption font-medium uppercase tracking-wide text-reported">
        Reported
      </span>
      <span className="tnum text-caption font-semibold text-text">
        {children}
      </span>
    </span>
  );
}

// REPORTED_FIGURE_RE — a SIGNED percentage ("+1.32%", "-2.3%", "−2.3%").
//
// Step 4 (prevent a misreading): green/red in this app means Agent 1's EXPECTED
// theoretical impact, while a figure like SET +1.32% is a move the source
// actually reported. Those must not read as the same kind of claim.
//
// Why only SIGNED figures: the sign is what distinguishes a reported move from
// a magnitude used in reasoning. Verified against the whole committed cache —
// every signed percentage in N006/N003/N007 (gold -2.3%, SET +1.32%, in both
// the dislocation text and all 13 scripts) is a reported market move, and no
// theoretical figure carries a sign. An unsigned number is left alone rather
// than risk labelling a hypothetical as observed data.
const REPORTED_FIGURE_RE = /([+−-]\s?\d+(?:[.,]\d+)?\s?%)/g;

// MarkReported — renders AI prose with any reported market figure wrapped in
// the reserved "Reported" treatment. Pure presentation: the text itself is
// never altered, reordered or truncated, so what the CIO approved is what is
// shown.
export function MarkReported({ text = "" }) {
  const parts = String(text).split(REPORTED_FIGURE_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    // split() with one capture group puts the matches at the odd indices.
    i % 2 === 1 ? (
      <ReportedFigure key={i}>{part}</ReportedFigure>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

// EmptyState — one rendering for every "nothing here yet" in the app.
export function EmptyState({ title, hint }) {
  return (
    <div className="rounded-card bg-surface px-6 py-14 text-center">
      <p className="text-body text-text-2">{title}</p>
      {hint && (
        <p className="mx-auto mt-2 max-w-sm text-caption leading-relaxed text-text-3">
          {hint}
        </p>
      )}
    </div>
  );
}

// Notice — a non-card advisory block (errors, caveats, limitations). Tone drives
// the left rail and the title colour; the body stays readable secondary text.
export function Notice({ tone = "flat", title, children, action }) {
  return (
    <div
      className={`rounded-card border-l-2 bg-surface px-4 py-3 ${toneClass(tone, "border")}`}
    >
      {title && (
        <p className={`text-body font-semibold ${toneClass(tone, "text")}`}>
          {title}
        </p>
      )}
      {children && (
        <div className="mt-1 text-caption leading-relaxed text-text-2">
          {children}
        </div>
      )}
      {action}
    </div>
  );
}

// Buttons. Primary is the only light-on-dark element in the app — it is the
// single most important control on any screen it appears on.
export function Button({
  variant = "secondary",
  className = "",
  children,
  ...rest
}) {
  const base =
    "rounded-control px-4 py-2 text-caption font-semibold transition disabled:cursor-not-allowed";
  const styles = {
    primary:
      "bg-text text-bg hover:bg-white disabled:bg-raised disabled:text-text-3",
    secondary:
      "border border-control-border text-text-2 hover:border-text-2 hover:text-text",
    quiet: "text-text-2 hover:text-text",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// --- Progress ---------------------------------------------------------------

// Stages — Step 5. A pipeline run is several distinct paid calls, so the
// loading state names them and says which one is live instead of spinning a
// generic ring. Stages before the active one read as done, the active one gets
// the pulse, later ones stay dim — the same row language as everything else.
//
//   stages: [{ id, label }]
//   active: the id currently running (null → nothing highlighted)
export function Stages({ stages, active }) {
  const activeIndex = stages.findIndex((s) => s.id === active);
  return (
    <ol className="overflow-hidden rounded-card bg-surface">
      {stages.map((s, i) => {
        const done = activeIndex > -1 && i < activeIndex;
        const running = s.id === active;
        return (
          <li
            key={s.id}
            className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
          >
            <span className="grid w-4 shrink-0 place-items-center" aria-hidden>
              {done ? (
                <IconCheck size={13} className="text-up" />
              ) : running ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-hairline-strong" />
              )}
            </span>
            <span
              className={`text-caption ${
                running
                  ? "font-semibold text-text"
                  : done
                    ? "text-text-2"
                    : "text-text-3"
              }`}
            >
              {s.label}
            </span>
            {running && (
              <span className="ml-auto text-caption text-text-3">
                Running…
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// --- Sector impacts ---------------------------------------------------------

// SectorImpacts — Agent 1's per-sector expected direction + mechanism.
//
// Step 4 lives here: the group carries an explicit caption saying these arrows
// are the EXPECTED theoretical impact, not an observed price move. Without it,
// a reader carrying over habits from a real stock app reads "▲ banking" as
// "banking went up today", which is a claim this system never makes.
export function SectorImpacts({ impacts }) {
  if (!impacts?.length) return null;
  return (
    <div>
      <p className="text-caption text-text-3">
        Expected impact (theoretical) — not observed price movement
      </p>
      <ul className="mt-2 space-y-2.5">
        {impacts.map((s) => (
          <li key={s.sector}>
            <div className="flex flex-wrap items-center gap-2">
              <DirectionTag direction={s.direction}>{s.sector}</DirectionTag>
              {s.direction === "neutral" && (
                <span className="text-caption text-text-3">
                  Neutral — not used for client matching
                </span>
              )}
            </div>
            {s.reason && (
              <p className="mt-1 text-caption leading-relaxed text-text-2">
                <MarkReported text={s.reason} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Icon-only controls -----------------------------------------------------

// IconButton — an icon-only control. The label is MANDATORY (not optional with a
// fallback): an icon-only button with no accessible name is invisible to a
// screen reader, and making the prop required means that can't be forgotten.
// The same string becomes both aria-label and the native tooltip, so pointer and
// AT users get identical wording.
//
// NOT for Approve/Reject. Those stay text buttons — see ApprovalDashboard.
export function IconButton({
  label,
  icon: Icon,
  onClick,
  tone,
  size = 16,
  className = "",
  ...rest
}) {
  if (!label) {
    throw new Error("IconButton: label is required (aria-label + tooltip)");
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-control transition-colors duration-(--duration-fast) ease-(--ease-out) hover:bg-raised hover:text-text ${tone ? toneClass(tone) : "text-text-3"} ${className}`}
      {...rest}
    >
      <Icon size={size} />
    </button>
  );
}

// --- Segmented destination bar ----------------------------------------------

// SegmentedBar — the right pane's three destinations. Icon + short label + an
// optional count badge.
//
// DISABLED DESTINATIONS stay in the tab order and keep a tooltip. A plain
// `disabled` attribute would drop them out of the tab order entirely, so a
// keyboard user could never reach the explanation for why Scripts is
// unavailable — they would just find a control that isn't there. aria-disabled
// plus an onClick guard keeps the control focusable and its reason readable,
// which is what the brief asks for: say why, rather than silently doing nothing.
export function SegmentedBar({ items, active, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Views"
      className="flex gap-1 rounded-pane bg-surface p-1"
    >
      {items.map((it) => {
        const isActive = it.id === active;
        const off = Boolean(it.disabledReason);
        const badge = isActive
          ? "bg-bg text-text-2"
          : "bg-raised text-text-3";
        let state = "text-text-2 hover:text-text";
        if (isActive) state = "bg-raised text-text";
        else if (off) state = "cursor-not-allowed text-text-3 opacity-60";
        return (
          <button
            key={it.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-disabled={off || undefined}
            title={it.disabledReason ?? it.hint ?? undefined}
            onClick={() => {
              if (off) return; // guard, not `disabled` — see above
              onChange(it.id);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-control px-2 py-2 text-caption font-semibold transition-all duration-(--duration-base) ease-(--ease-out) ${state}`}
          >
            <it.icon size={16} />
            <span>{it.label}</span>
            {it.count != null && (
              <span className={`tnum rounded-tag px-1.5 text-caption font-semibold ${badge}`}>
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- News item status (left rail) -------------------------------------------

// Per-item pipeline state shown in the news rail. SHAPE carries the meaning as
// much as colour does (ring / clock / check / slash), so the rail stays readable
// without relying on green vs red.
export const NEWS_STATUS = {
  idle: { label: "Not analyzed", tone: "flat", icon: IconDotEmpty },
  analyzing: { label: "Analyzing", tone: "flat", icon: IconPending },
  pending: { label: "Pending review", tone: "alert", icon: IconPending },
  approved: { label: "Approved", tone: "up", icon: IconApproved },
  rejected: { label: "Rejected", tone: "flat", icon: IconRejected },
  error: { label: "Failed", tone: "down", icon: IconWarning },
  not_relevant: { label: "Skipped", tone: "flat", icon: IconRejected },
};

// StatusGlyph — one news item's pipeline state, as an icon with a text tooltip
// and a screen-reader label.
export function StatusGlyph({ status, size = 15 }) {
  const meta = NEWS_STATUS[status] ?? NEWS_STATUS.idle;
  const Glyph = meta.icon;
  return (
    <span title={meta.label} className={toneClass(meta.tone)}>
      <Glyph size={size} />
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

// --- Shared row bodies -----------------------------------------------------

// TickerRun — a client's matched holdings as "TRUE▼, BEM▼, LH▼". The arrow
// carries the direction where matching supplied one; a screen reader gets the
// word. Shared so every view renders a client's tickers identically.
export function TickerRun({ holdings = [] }) {
  return (
    <span className="text-caption text-text-3">
      {holdings.map((h, i) => {
        const d = DIRECTION_META[h.direction];
        return (
          <span key={h.ticker} className="whitespace-nowrap">
            {i > 0 && <span className="text-text-3">, </span>}
            <span className="text-text-2">{h.ticker}</span>
            {d && (
              <span className={toneClass(d.tone)} title={d.label}>
                {d.arrow}
                <span className="sr-only">{d.label}</span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// ClientRow — the compact ranked row used by the priority lists. Name + tags +
// tickers left, percentage right in tabular figures, rank small and dim.
//
// The percentage is impact share ONLY (calculateImpactShare), never
// priorityScore — unchanged from before the redesign. The Key Account tag is
// what explains any ordering inversion.
export function ClientRow({ client, rank, keyAccount, children }) {
  const pct = Math.round(
    calculateImpactShare(client.matchedHoldings ?? []) * 100,
  );
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Rank n={rank} />
      {/* Key Account rail — a 2px token-coloured edge, readable at a glance
          while scrolling, and it does not tint the row (a tint read as
          "disabled" against the old light page and reads as noise on a dark
          one). */}
      <div
        className={`min-w-0 flex-1 ${keyAccount ? "border-l-2 border-alert pl-3" : ""}`}
      >
        <p className="truncate text-body font-medium text-text">
          {client.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-caption text-text-3">
            {riskLabel(client.riskProfile)}
          </span>
          {children}
          <TickerRun holdings={client.matchedHoldings ?? []} />
        </div>
      </div>
      <Pct value={pct} />
    </div>
  );
}
