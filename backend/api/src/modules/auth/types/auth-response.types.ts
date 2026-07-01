import type { UserAccessContext, UserSessionRecord } from '../../iam/types/iam.types';

export type AuthUserResponse = Omit<UserAccessContext, 'sessionId'> & {
  property_ids: string[];
};

export type AuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: AuthUserResponse;
};

export type SessionResponse = Omit<UserSessionRecord, 'refreshTokenHash'>;
