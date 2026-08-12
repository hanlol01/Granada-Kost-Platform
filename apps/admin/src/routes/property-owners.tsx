import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerWorkspace } from "@/components/property-owners/PropertyOwnerWorkspace";
export const Route = createFileRoute("/property-owners")({ component: PropertyOwnerWorkspace });
