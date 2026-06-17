import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';

export function auditContext(user: UserAccessContext, request: RequestWithCorrelationId) {
  return {
    actorUserId: user.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

export async function scopedPropertyIds(
  properties: PropertyService,
  user: UserAccessContext,
  propertyId?: string,
): Promise<string[]> {
  if (propertyId) {
    await properties.assertCanReadProperty(user, propertyId);
    return [propertyId];
  }

  if (user.roles.includes('owner') || user.roles.includes('property_owner')) {
    return (await properties.list(user)).map((property) => property.id);
  }

  return user.propertyIds;
}
