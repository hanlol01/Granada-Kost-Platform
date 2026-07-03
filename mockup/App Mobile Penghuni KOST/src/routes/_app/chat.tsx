import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { chatMessages } from "@/lib/dummy-data";
import { Send, Phone, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

type Msg = { id: number; from: "me" | "admin"; text: string; time: string };

function ChatPage() {
  const [msgs, setMsgs] = useState<Msg[]>(chatMessages as Msg[]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);

  const send = () => {
    if (!text.trim()) return;
    const t = text.trim();
    const now = new Date();
    const time = now.toTimeString().slice(0, 5);
    setMsgs((m) => [...m, { id: Date.now(), from: "me", text: t, time }]);
    setText("");
    setTyping(true);
    setTimeout(() => {
      setMsgs((m) => [
        ...m,
        {
          id: Date.now() + 1,
          from: "admin",
          text: "Terima kasih atas pesannya, kami akan segera respon ya. 🙏",
          time: new Date().toTimeString().slice(0, 5),
        },
      ]);
      setTyping(false);
    }, 1400);
  };

  return (
    <div className="flex h-screen flex-col">
      <AppHeader
        title="Admin Kos"
        subtitle="Online · biasanya membalas <5 menit"
        back
        action={
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success">
            <Phone className="h-4 w-4" />
          </button>
        }
      />

      <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl bg-destructive/10 p-2.5 text-[11px] text-destructive">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        Untuk darurat, hubungi: <strong>+62 811-9000-119</strong>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 pb-32">
        <div className="flex flex-col gap-2">
          {msgs.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
          {typing && (
            <div className="self-start rounded-2xl rounded-bl-md bg-card px-4 py-3 shadow-[var(--shadow-soft)]">
              <div className="flex gap-1">
                <Dot delay={0} /><Dot delay={150} /><Dot delay={300} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-30 mx-auto max-w-md border-t border-border bg-card/90 p-3 backdrop-blur-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tulis pesan..."
            className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-glow)] active:scale-95"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
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

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
      style={{ animation: `fade-in 0.6s ease-in-out ${delay}ms infinite alternate` }}
    />
  );
}
