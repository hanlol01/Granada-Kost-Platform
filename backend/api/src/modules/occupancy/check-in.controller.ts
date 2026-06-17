import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CreateCheckInDto } from './dto/create-check-in.dto';
import { OccupancyService } from './occupancy.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('lease.manage')
@Controller('check-ins')
export class CheckInController {
  constructor(private readonly occupancies: OccupancyService) {}

  @Post()
  complete(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateCheckInDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.occupancies.completeCheckIn(user, dto, this.contextFromRequest(request));
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
