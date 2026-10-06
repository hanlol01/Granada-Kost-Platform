# Notification Center Component Reference

Status: USER-SUPPLIED REFERENCE; the implemented adaptation and verification record live in `NOTIFICATION_CENTER_IMPLEMENTATION.md`.

The user supplied this component on 5 October 2026 for the Admin, Penghuni,
and Property Owner header bell. Preserve this reference so a later implementation
does not require the user to paste the prompt again. The existing applications
already use React, TypeScript, Tailwind, and `src/components/ui`.

The GitHub, Slack, deployment, CI, and card-payment examples in the supplied demo
illustrate presentation only. Actual items must come from Kostation's authorized
notification feeds and agree with each role's notifications page.

## Integration considerations to resolve during planning

- Keep notification data controlled by the authorized API/cache. Initializing
  `rows` from `items` once would miss subsequent arrivals and read-state updates.
- Specify per-account read/archive state, role visibility, category, priority,
  authorized destination, and the relationship with source business status.
- Localize all visible labels to Indonesian; use the existing icon library.
- Decide what dismiss/clear mean before exposing those actions.
- Support keyboard interaction, focus return, mobile scrolling, and reduced motion.
- Reuse existing theme tokens and responsive overlay primitives.
- Persist actual decisions in a separate implementation plan after the interview.

## Supplied component

```tsx
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

export type NotificationTone =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface NotificationItem {
  id: string;
  /** App or system name, shown above the title when set. */
  source?: string;
  /** Emoji used as the avatar; falls back to a bell glyph. */
  emoji?: string;
  title: string;
  body: string;
  /** Relative timestamp, e.g. "2m ago". */
  time: string;
  unread?: boolean;
  tone?: NotificationTone;
}

export interface NotificationStackProps {
  items: NotificationItem[];
  title?: string;
  defaultExpanded?: boolean;
  showFooter?: boolean;
  /** Entrance animation stagger per row, ms. */
  staggerMs?: number;
  className?: string;
  onDismiss?: (id: string) => void;
  onClearAll?: () => void;
  onMarkAllRead?: () => void;
}

const TONE_BAR: Record<NotificationTone, string> = {
  default: "bg-primary",
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

function BellGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Stacked notification center: grouped rows with tone accents, unread dots,
 * click-to-expand bodies, and header bulk actions. Fully theme-token based,
 * so it renders correctly in light and dark.
 */
export function NotificationCenter({
  items,
  title = "Notifications",
  defaultExpanded = true,
  showFooter = true,
  staggerMs = 50,
  className = "",
  onDismiss,
  onClearAll,
  onMarkAllRead,
}: NotificationStackProps): ReactNode {
  const [rows, setRows] = useState<NotificationItem[]>(items);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => (defaultExpanded ? rows : rows.filter((n) => n.unread)),
    [rows, defaultExpanded],
  );
  const unreadCount = rows.filter((n) => n.unread).length;
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const dismiss = (id: string) => {
    setRows((prev) => prev.filter((n) => n.id !== id));
    onDismiss?.(id);
  };
  const clearAll = () => {
    setRows([]);
    onClearAll?.();
  };
  const markAllRead = () => {
    setRows((prev) => prev.map((n) => ({ ...n, unread: false })));
    onMarkAllRead?.();
  };

  return (
    <section
      className={
        "w-full overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-xl " +
        className
      }
      style={{ maxWidth: 400 }}
    >
      <style>{`
        @keyframes nstack-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .nstack-row { animation: nstack-in 260ms ease-out both; }
      `}</style>

      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {unreadCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              Clear
            </button>
          </div>
        )}
      </header>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-muted-foreground">
          <CheckGlyph />
          <p className="text-sm">You're all caught up</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((n, i) => {
            const open = openIds.has(n.id);
            return (
              <li
                key={n.id}
                className="nstack-row group relative flex cursor-pointer gap-3 px-4 py-3 pl-5 transition-colors hover:bg-muted/50"
                style={{ animationDelay: `${i * staggerMs}ms` }}
                onClick={() => toggleOpen(n.id)}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 w-1 ${TONE_BAR[n.tone ?? "default"]}`}
                />
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-base">
                  {n.emoji ?? <BellGlyph />}
                </span>
                <div className="min-w-0 flex-1">
                  {n.source && (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {n.source}
                    </p>
                  )}
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">
                      {n.title}
                    </p>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {n.time}
                    </time>
                  </div>
                  <p
                    className={
                      "pt-0.5 text-sm text-muted-foreground " +
                      (open ? "" : "line-clamp-1")
                    }
                  >
                    {n.body}
                  </p>
                </div>
                <span className="flex shrink-0 flex-col items-center justify-between py-0.5">
                  {n.unread && (
                    <span
                      className="size-2 rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`Dismiss ${n.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(n.id);
                    }}
                    className="ml-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <CloseGlyph />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {showFooter && (
        <footer className="border-t border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          {rows.length === 0
            ? "Nothing pending"
            : `${rows.length} notification${rows.length === 1 ? "" : "s"} · click a row to expand`}
        </footer>
      )}
    </section>
  );
}

export default NotificationCenter;
```

The supplied demo passes `showFooter: true`, `defaultExpanded: true`, and
`staggerMs: 60`, and renders the component inside a padded container. Demo events
use all five tones; two are unread. These settings are reference defaults rather
than approved Kostation business rules.
