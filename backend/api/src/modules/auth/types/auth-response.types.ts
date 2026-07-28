import type { UserAccessContext, UserSessionRecord } from '../../iam/types/iam.types';

export type AuthUserResponse = Omit<UserAccessContext, 'sessionId'> & {
  property_ids: string[];
};

export type AuthPropertyRolloutResponse = {
  propertyId: string;
  adminUxRead: {
    enabled: boolean;
  };
  bookingHoldWrite: {
    enabled: boolean;
  };
};

export type AuthMeResponse = AuthUserResponse & {
  propertyRollouts: AuthPropertyRolloutResponse[];
};

export type AuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: AuthUserResponse;
};

export type SessionResponse = Omit<UserSessionRecord, 'refreshTokenHash'>;
