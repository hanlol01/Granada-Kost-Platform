import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListPaymentProofsQueryDto } from '../dto/list-payment-proofs-query.dto';
import { PaymentProofService } from '../services/payment-proof.service';
import { scopedPropertyIds } from './billing-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('payment.verify')
@Controller('payment-proofs')
export class PaymentProofController {
  constructor(
    private readonly proofs: PaymentProofService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListPaymentProofsQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    const results = await Promise.all(
      propertyIds.map((propertyId) => this.proofs.list(propertyId, query.status, query.limit, query.offset)),
    );
    return results.flat();
  }

  @Get(':proofId')
  async get(@CurrentUser() user: UserAccessContext, @Param('proofId') proofId: string) {
    const proof = await this.proofs.get(proofId);
    await this.properties.assertCanReadProperty(user, proof.propertyId);
    return proof;
  }
}
