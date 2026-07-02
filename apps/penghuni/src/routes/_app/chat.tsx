import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { chatMessages } from "@/lib/dummy-data";
import { isChatEnabled } from "@/lib/features";
import { Send, Phone, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

type Msg = { id: number; from: "me" | "admin"; text: string; time: string };

function ChatPage() {
  const enabled = isChatEnabled();
  const msgs = chatMessages as Msg[];

  if (!enabled) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader
          title="Chat dengan Admin"
          subtitle="Fitur dinonaktifkan untuk release saat ini"
          back
        />
        <div className="flex flex-1 items-center justify-center px-5">
          <div className="w-full rounded-2xl border border-dashed border-border bg-card p-5 text-center shadow-[var(--shadow-soft)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold">Chat belum tersedia</p>
            <p className="mt-1 text-xs text-muted-foreground">
              VITE_FEATURE_CHAT_ENABLED=false. Untuk saat ini, gunakan kontak darurat atau hubungi
              admin secara langsung.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <AppHeader
        title="Admin Kos"
        subtitle="Mode placeholder - belum terhubung ke backend chat"
        back
        action={
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground"
            disabled
            aria-label="Panggilan belum tersedia"
          >
            <Phone className="h-4 w-4" />
          </button>
        }
      />

      <div className="mx-5 mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-[11px] text-muted-foreground">
        <p className="font-semibold text-warning-foreground">Chat masih placeholder</p>
        <p className="mt-0.5">
          Percakapan di bawah adalah contoh UI. Pengiriman pesan dinonaktifkan sampai backend chat
          dan inbox admin tersedia.
        </p>
      </div>

      <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl bg-destructive/10 p-2.5 text-[11px] text-destructive">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        Untuk darurat, hubungi: <strong>+62 811-9000-119</strong>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 pb-36">
        <div className="flex flex-col gap-2">
          {msgs.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-30 mx-auto max-w-md border-t border-border bg-card/90 p-3 backdrop-blur-xl">
        <form onSubmit={(e) => e.preventDefault()} className="flex items-center gap-2">
          <input
            placeholder="Chat real belum tersedia"
            disabled
            className="h-11 flex-1 rounded-full border border-border bg-secondary px-4 text-sm text-muted-foreground outline-none disabled:opacity-70"
          />
          <button
            type="submit"
            disabled
            aria-label="Kirim pesan belum tersedia"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Pengiriman pesan menunggu backend chat dan inbox admin.
        </p>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const mine = m.from === "me";
  return (
    <div className={mine ? "self-end" : "self-start"}>
      <div
        className={
          "max-w-[80vw] rounded-2xl px-3.5 py-2.5 text-sm animate-[scale-in_0.2s_ease-out] " +
          (mine
            ? "rounded-br-md bg-[image:var(--gradient-primary)] text-primary-foreground"
            : "rounded-bl-md bg-card shadow-[var(--shadow-soft)]")
        }
      >
        {m.text}
      </div>
      <p className={"mt-0.5 text-[10px] text-muted-foreground " + (mine ? "text-right" : "")}>
        {m.time}
      </p>
    </div>
  );
}
