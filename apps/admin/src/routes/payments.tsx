import { createFileRoute } from "@tanstack/react-router";
import { PaymentsWorkspace } from "@/components/billing/PaymentsWorkspace";

export const Route = createFileRoute("/payments")({ component: PaymentsWorkspace });
