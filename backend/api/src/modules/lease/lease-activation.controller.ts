import { Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { UserAccessContext } from '../iam/types/iam.types';
import { ActivateLeaseDto } from './dto/activate-lease.dto';
import { LeaseActivationService } from './lease-activation.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('lease.manage')
@Controller('leases')
export class LeaseActivationController {
  constructor(private readonly activations: LeaseActivationService) {}
  @Post(':leaseId/activate')
  activate(
    @CurrentUser() user: UserAccessContext,
    @Param('leaseId') leaseId: string,
    @Body() dto: ActivateLeaseDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.activations.activate(user, leaseId, dto, key, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    });
  }
}
