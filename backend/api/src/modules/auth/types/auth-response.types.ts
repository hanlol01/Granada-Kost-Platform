import type { UserAccessContext, UserSessionRecord } from '../../iam/types/iam.types';

export type AuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: Omit<UserAccessContext, 'sessionId'>;
};

export type SessionResponse = Omit<UserSessionRecord, 'refreshTokenHash'>;
