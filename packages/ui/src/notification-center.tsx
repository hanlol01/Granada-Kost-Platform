import { useEffect, useId, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarCheck,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  notificationCategoryLabels,
  notificationPriorityLabels,
  notificationTimestamp,
  safeNotificationHref,
  type NotificationItem,
  type NotificationView,
} from "./notification-model";
import {
  useNotificationInbox,
  type NotificationInboxOptions,
} from "./use-notification-inbox";
import "./notification-center.css";

const categoryIcons: Record<string, LucideIcon> = {
  booking: CalendarCheck,
  payments: CreditCard,
  rooms: Building2,
  lease: CalendarCheck,
  checkout: FileCheck2,
  realization: Wallet,
  transfer: Wallet,
  service: Wrench,
  account: ShieldCheck,
};
type Inbox = ReturnType<typeof useNotificationInbox>;
interface CenterProps {
  inbox: Inbox;
  role: NotificationInboxOptions["role"];
  status: NotificationView;
  allHref?: string;
  compact?: boolean;
  closeAction?: ReactNode;
  filtered?: boolean;
  onShowActive?: () => void;
}

function BulkActions({ inbox, archived }: { inbox: Inbox; archived: boolean }) {
  if (archived || !inbox.enabled) return null;
  return (
    <div className="nc-actions">
      <button
        className="nc-button nc-button--quiet"
        disabled={inbox.pending || inbox.unreadCount === 0}
        onClick={() => void inbox.readAll().catch(() => {})}
      >
        <CheckCheck aria-hidden="true" /> Tandai semua dibaca
      </button>
      <button
        className="nc-button nc-button--quiet"
        disabled={inbox.pending}
        onClick={() => void inbox.archiveRead().catch(() => {})}
      >
        <Archive aria-hidden="true" /> Arsipkan yang sudah dibaca
      </button>
    </div>
  );
}

export function NotificationCenter({
  inbox,
  role,
  status,
  allHref,
  compact,
  closeAction,
  filtered,
  onShowActive,
}: CenterProps) {
  // Expansion survives removal from the unread query; this snapshot is display-only.
  const [expanded, setExpanded] = useState<NotificationItem | null>(null);
  const contentId = useId();
  const items = inbox.data?.items ?? [];
  const retained =
    expanded &&
    !items.some((item) => item.id === expanded.id) &&
    expanded.status === "read"
      ? expanded
      : null;
  const visible = retained
    ? [retained, ...items].slice(0, compact ? 10 : 20)
    : items;
  const expand = async (item: NotificationItem) => {
    if (expanded?.id === item.id) {
      setExpanded(null);
      return;
    }
    setExpanded(item);
    if (item.status === "unread") {
      try {
        await inbox.read(item.id);
        setExpanded((previous) =>
          previous?.id === item.id ? { ...previous, status: "read" } : previous,
        );
      } catch {
        /* Shared mutation feedback explains the failure. */
      }
    }
  };
  const openRelated = async (item: NotificationItem, href: string) => {
    try {
      if (item.status === "unread") await inbox.read(item.id);
      window.location.assign(href);
    } catch {
      /* Keep the current context and show inline feedback. */
    }
  };
  return (
    <section
      className={`nc nc-center${compact ? " nc-center--compact" : ""}`}
      aria-label="Daftar notifikasi"
      aria-busy={inbox.isFetching}
    >
      <header className="nc-heading">
        <div>
          <h2>
            Notifikasi{" "}
            <span
              className="nc-count"
              aria-label={`${inbox.unreadCount} belum dibaca`}
            >
              {inbox.unreadCount}
            </span>
          </h2>
          <p>
            {compact
              ? "Ringkasan terbaru untuk akun Anda"
              : "Baca dan arsipkan tanpa mengubah data terkait."}
          </p>
        </div>
        {closeAction ?? (
          <button
            className="nc-icon-button"
            aria-label="Perbarui notifikasi"
            disabled={inbox.isFetching}
            onClick={() => void inbox.refetch()}
          >
            <RefreshCw aria-hidden="true" />
          </button>
        )}
      </header>
      <BulkActions inbox={inbox} archived={status === "archived"} />
      {inbox.actionError ? (
        <p className="nc-message nc-message--error" role="alert">
          {inbox.actionError}
        </p>
      ) : null}
      {inbox.feedback ? (
        <p className="nc-message" role="status">
          {inbox.feedback}
        </p>
      ) : null}
      <div className="nc-list-scroll">
        {inbox.isPending && inbox.enabled ? (
          <div className="nc-loading" role="status">
            <span>Memuat notifikasi…</span>
            {[0, 1, 2].map((i) => (
              <div className="nc-skeleton" key={i} />
            ))}
          </div>
        ) : inbox.isError ? (
          <div className="nc-empty" role="alert">
            <Info aria-hidden="true" />
            <h3>Notifikasi belum dapat dimuat</h3>
            <p>Periksa koneksi atau akses akun Anda, lalu muat ulang daftar.</p>
            <button className="nc-button" onClick={() => void inbox.refetch()}>
              Coba lagi
            </button>
          </div>
        ) : !inbox.enabled ? (
          <div className="nc-empty">
            <Info aria-hidden="true" />
            <h3>Notifikasi belum tersedia</h3>
            <p>
              Masuk dengan akun yang sesuai dan pilih properti untuk melihat
              notifikasi.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="nc-empty">
            <CheckCheck aria-hidden="true" />
            <h3>
              {filtered
                ? "Tidak ada notifikasi sesuai filter"
                : status === "unread"
                  ? "Tidak ada notifikasi belum dibaca"
                  : status === "archived"
                    ? "Arsip notifikasi masih kosong"
                    : "Belum ada notifikasi aktif"}
            </h3>
            <p>
              {filtered
                ? "Ubah kata pencarian atau filter untuk melihat informasi lainnya."
                : status === "archived"
                  ? "Notifikasi yang Anda arsipkan dapat ditemukan di sini."
                  : "Informasi baru akan muncul saat ada peristiwa yang terkait dengan akses Anda."}
            </p>
            {status === "unread" && onShowActive ? (
              <button className="nc-button" onClick={onShowActive}>
                Lihat semua aktif
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="nc-list">
            {visible.map((item) => {
              const open = expanded?.id === item.id;
              const Icon = categoryIcons[item.category] ?? Bell;
              const href = safeNotificationHref(item.relatedHref, role);
              return (
                <li
                  key={item.id}
                  className="nc-row"
                  data-priority={item.priority}
                  data-unread={item.status === "unread"}
                >
                  <span className="nc-avatar">
                    <Icon aria-hidden="true" />
                  </span>
                  <div className="nc-row-content">
                    <div className="nc-row-meta">
                      <span>
                        {notificationCategoryLabels[item.category] ??
                          "Informasi lainnya"}
                      </span>
                      <span className="nc-priority">
                        {notificationPriorityLabels[item.priority]}
                      </span>
                    </div>
                    <button
                      className="nc-expand"
                      aria-expanded={open}
                      aria-controls={`${contentId}-${item.id}`}
                      disabled={inbox.pending}
                      onClick={() => void expand(item)}
                    >
                      <span className="nc-row-title">{item.title}</span>
                      {open ? (
                        <ChevronUp aria-hidden="true" />
                      ) : (
                        <ChevronDown aria-hidden="true" />
                      )}
                    </button>
                    <p
                      id={`${contentId}-${item.id}`}
                      className={open ? "nc-body" : "nc-body nc-body--clamped"}
                    >
                      {item.body}
                    </p>
                    <time dateTime={item.createdAt} className="nc-time">
                      {notificationTimestamp(item.createdAt)}
                    </time>
                    {item.superseded ? (
                      <p className="nc-time">
                        Informasi ini telah diperbarui. Buka detail untuk
                        melihat catatan terbaru.
                      </p>
                    ) : null}
                    {open ? (
                      <div className="nc-row-links">
                        {href ? (
                          <button
                            className="nc-button nc-button--quiet"
                            disabled={inbox.pending}
                            onClick={() => void openRelated(item, href)}
                          >
                            Buka detail <ExternalLink aria-hidden="true" />
                          </button>
                        ) : (
                          <span className="nc-time">
                            Detail terkait tidak tersedia dalam akses Anda.
                          </span>
                        )}
                        {item.status === "read" ? (
                          <span className="nc-read-label">Sudah dibaca</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="nc-row-end">
                    {item.status === "unread" ? (
                      <span
                        className="nc-unread-dot"
                        aria-label="Belum dibaca"
                      />
                    ) : null}
                    {item.status !== "archived" ? (
                      <button
                        className="nc-icon-button"
                        title="Arsipkan notifikasi"
                        aria-label={`Arsipkan: ${item.title}`}
                        disabled={inbox.pending}
                        onClick={async () => {
                          try {
                            await inbox.archive(item.id);
                            if (expanded?.id === item.id) setExpanded(null);
                          } catch {
                            /* Inline feedback. */
                          }
                        }}
                      >
                        <X aria-hidden="true" />
                      </button>
                    ) : (
                      <Archive
                        aria-label="Diarsipkan"
                        className="nc-archived-icon"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {allHref ? (
        <footer className="nc-footer">
          <span>Maksimal 10 notifikasi terbaru</span>
          <a className="nc-button nc-button--quiet" href={allHref}>
            Lihat semua <ArrowRight aria-hidden="true" />
          </a>
        </footer>
      ) : null}
    </section>
  );
}

function useMobileSheet() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function NotificationBell(
  props: NotificationInboxOptions & { allHref: string },
) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<NotificationView>("unread");
  const mobile = useMobileSheet();
  const inbox = useNotificationInbox({
    ...props,
    listEnabled: open,
    filters: { status, limit: 10, offset: 0 },
  });
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) void inbox.refetch();
  };
  const trigger = (
    <button
      className="nc nc-bell"
      aria-label={`Notifikasi, ${inbox.unreadCount} belum dibaca`}
    >
      <Bell aria-hidden="true" />
      {inbox.unreadCount > 0 ? (
        <span className="nc-bell-count">
          {inbox.unreadCount > 99 ? "99+" : inbox.unreadCount}
        </span>
      ) : null}
    </button>
  );
  const contents = (closeAction: ReactNode) => (
    <div className="nc-panel-inner">
      <div className="nc nc-tabs" aria-label="Tampilan notifikasi">
        {(
          [
            ["unread", "Belum dibaca"],
            ["active", "Semua aktif"],
          ] as const
        ).map(([value, label]) => (
          <button
            className="nc-button"
            aria-pressed={status === value}
            key={value}
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <NotificationCenter
        key={`${props.accountKey}-${props.propertyId}-${status}`}
        inbox={inbox}
        role={props.role}
        status={status}
        compact
        allHref={props.allHref}
        closeAction={closeAction}
        onShowActive={() => setStatus("active")}
      />
    </div>
  );
  return mobile ? (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="nc-overlay" />
        <Dialog.Content className="nc-sheet">
          <Dialog.Title className="nc-sr-only">Pusat notifikasi</Dialog.Title>
          <Dialog.Description className="nc-sr-only">
            Notifikasi terbaru untuk akun Anda. Membuka panel tidak menandai
            notifikasi dibaca.
          </Dialog.Description>
          {contents(
            <Dialog.Close
              className="nc nc-icon-button"
              aria-label="Tutup notifikasi"
            >
              <X aria-hidden="true" />
            </Dialog.Close>,
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  ) : (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="nc-popover"
          side="bottom"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          aria-label="Pusat notifikasi"
        >
          {contents(
            <Popover.Close
              className="nc nc-icon-button"
              aria-label="Tutup notifikasi"
            >
              <X aria-hidden="true" />
            </Popover.Close>,
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}
export function NotificationInboxPage(
  props: NotificationInboxOptions & {
    renderDateField?: (props: DateFieldProps) => ReactNode;
    renderMonthField?: (props: DateFieldProps) => ReactNode;
  },
) {
  const [status, setStatus] = useState<NotificationView>("unread");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<
    "" | "urgent" | "high" | "normal" | "low"
  >("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState("");
  const [asset, setAsset] = useState("");
  const [offset, setOffset] = useState(0);
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const dateError = Boolean(from && to && from > to);
  const inbox = useNotificationInbox({
    ...props,
    filters: {
      status,
      category: category || undefined,
      priority: priority || undefined,
      search: debouncedSearch || undefined,
      period: props.role === "owner" ? period || undefined : undefined,
      asset: props.role === "owner" ? asset || undefined : undefined,
      from: dateError ? undefined : from || undefined,
      to: dateError ? undefined : to || undefined,
      limit: 20,
      offset,
    },
  });
  const change = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setOffset(0);
  };
  const reset = () => {
    setSearch("");
    setDebouncedSearch("");
    setCategory("");
    setPriority("");
    setFrom("");
    setTo("");
    setPeriod("");
    setAsset("");
    setOffset(0);
  };
  const dateField = (
    suffix: string,
    label: string,
    value: string,
    setter: (value: string) => void,
  ) =>
    props.renderDateField ? (
      props.renderDateField({
        id: `${id}-${suffix}`,
        label,
        value,
        onChange: (next) => change(setter, next),
      })
    ) : (
      <label className="nc-field" htmlFor={`${id}-${suffix}`}>
        {label}
        <input
          id={`${id}-${suffix}`}
          type="date"
          value={value}
          onChange={(event) => change(setter, event.target.value)}
        />
      </label>
    );
  const total = inbox.data?.total ?? 0;
  return (
    <div className="nc nc-page">
      <div className="nc-tabs" aria-label="Tampilan notifikasi">
        {(
          [
            ["unread", "Belum dibaca"],
            ["active", "Semua aktif"],
            ["archived", "Arsip"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className="nc-button"
            aria-pressed={status === value}
            onClick={() => change(setStatus, value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="nc-filters">
        <label className="nc-field nc-field--search" htmlFor={`${id}-search`}>
          Cari notifikasi
          <span className="nc-search-input">
            <Search aria-hidden="true" />
            <input
              id={`${id}-search`}
              type="search"
              placeholder="Judul atau isi notifikasi"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>
        <label className="nc-field" htmlFor={`${id}-category`}>
          Kategori
          <select
            id={`${id}-category`}
            value={category}
            onChange={(event) => change(setCategory, event.target.value)}
          >
            <option value="">Semua kategori</option>
            {(inbox.data?.availableCategories ?? []).map((value) => (
              <option key={value} value={value}>
                {notificationCategoryLabels[value] ?? "Informasi lainnya"}
              </option>
            ))}
          </select>
        </label>
        <label className="nc-field" htmlFor={`${id}-priority`}>
          Perhatian
          <select
            id={`${id}-priority`}
            value={priority}
            onChange={(event) =>
              change(setPriority, event.target.value as typeof priority)
            }
          >
            <option value="">Semua tingkat perhatian</option>
            {Object.entries(notificationPriorityLabels).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>
        {props.role === "owner" ? (
          <>
            {props.renderMonthField ? (
              props.renderMonthField({
                id: `${id}-period`,
                label: "Periode laporan",
                value: period,
                onChange: (next) => change(setPeriod, next),
              })
            ) : (
              <label className="nc-field" htmlFor={`${id}-period`}>
                Periode laporan
                <input
                  id={`${id}-period`}
                  type="month"
                  value={period}
                  onChange={(event) => change(setPeriod, event.target.value)}
                />
              </label>
            )}
            <label className="nc-field" htmlFor={`${id}-asset`}>
              Aset terkait
              <select
                id={`${id}-asset`}
                value={asset}
                onChange={(event) => change(setAsset, event.target.value)}
              >
                <option value="">Semua aset</option>
                {(inbox.data?.availableAssets ?? []).map((code) => (
                  <option value={code} key={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {dateField("from", "Dari tanggal", from, setFrom)}
        {dateField("to", "Sampai tanggal", to, setTo)}
        <button className="nc-button nc-reset" onClick={reset}>
          Reset filter
        </button>
        {dateError ? (
          <p className="nc-message nc-message--error" role="alert">
            Tanggal awal tidak boleh setelah tanggal akhir. Perbaiki rentang
            tanggal.
          </p>
        ) : null}
      </div>
      <NotificationCenter
        key={`${props.accountKey}-${props.propertyId}-${status}-${category}-${priority}-${debouncedSearch}-${from}-${to}-${period}-${asset}-${offset}`}
        inbox={inbox}
        role={props.role}
        status={status}
        filtered={Boolean(
          category ||
          priority ||
          debouncedSearch ||
          from ||
          to ||
          period ||
          asset,
        )}
        onShowActive={() => change(setStatus, "active")}
      />
      {total > 0 ? (
        <footer className="nc-pagination">
          <span>
            {offset + 1}–{Math.min(offset + 20, total)} dari {total} notifikasi
          </span>
          <div>
            <button
              className="nc-button"
              disabled={offset === 0 || inbox.isFetching}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              <ArrowLeft aria-hidden="true" /> Sebelumnya
            </button>
            <button
              className="nc-button"
              disabled={offset + 20 >= total || inbox.isFetching}
              onClick={() => setOffset(offset + 20)}
            >
              Berikutnya <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
