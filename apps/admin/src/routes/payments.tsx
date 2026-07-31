import { createFileRoute } from "@tanstack/react-router";
import { W06PaymentsWorkspace } from "@/components/billing/W06PaymentsWorkspace";

export const Route = createFileRoute("/payments")({ component: W06PaymentsWorkspace });
