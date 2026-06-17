import type { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import type { UserAccessContext } from '../../iam/types/iam.types';

export type AuthenticatedRequest = RequestWithCorrelationId & {
  user?: UserAccessContext;
};
