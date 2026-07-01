// Auth-related shared types. The shape mirrors GET /api/v1/auth/me.
// Backend remains authoritative; frontend uses these for typing only.

import type { RoleCode } from "./enums";

export type PropertyScopeRef = {
  id: string;
  name?: string;
};

export type AuthMe = {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  phone?: string | null;
  roles: RoleCode[];
  permissions: string[];
  property_ids: string[];
  propertyIds?: string[];
  properties?: PropertyScopeRef[];
  resident_id?: string | null;
  session_id?: string;
};

export type AuthSession = {
  id: string;
  device_name?: string;
  user_agent?: string;
  ip_address?: string;
  last_activity_at?: string;
  created_at?: string;
  current?: boolean;
};

export type LoginRequest = {
  identifier: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  access_token_expires_in?: number;
  // refresh_token is delivered via HTTP-only cookie (ADR-FE-003).
  // Backend MAY return it in the body in dev; client ignores it.
  refresh_token?: string;
  user?: AuthMe;
};
