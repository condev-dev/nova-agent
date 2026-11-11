import { Suspense } from "react";
import Chat from "@/components/Chat";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-[color:var(--fg-muted)]">
          در حال بارگذاری…
        </div>
      }
    >
      <Chat />
    </Suspense>
  );
}
