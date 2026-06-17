export type UserStatus = 'active' | 'inactive' | 'suspended';

export type AuthUserRecord = {
  id: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  displayName: string;
  userStatus: UserStatus;
  lastLoginAt: Date | null;
};

export type UserSessionRecord = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceName: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type UserAccessContext = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  roles: string[];
  permissions: string[];
  propertyIds: string[];
  sessionId: string;
};

export type CreateSessionInput = {
  userId: string;
  refreshTokenHash: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
};

export type AuthAuditInput = {
  actorUserId?: string;
  action: string;
  resultStatus: 'success' | 'failed' | 'denied';
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
};
