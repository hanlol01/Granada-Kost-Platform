import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
    </div>
  );
}
