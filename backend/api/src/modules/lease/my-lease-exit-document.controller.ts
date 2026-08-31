import { Controller, Get, Header, Param, StreamableFile, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { LeaseCheckoutService } from './lease-checkout.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('resident')
@RequirePermissions('billing.self.read')
@Controller('my/lease-exit-documents')
export class MyLeaseExitDocumentController {
  constructor(private readonly checkout: LeaseCheckoutService) {}

  @Get(':documentId/document')
  @Header('Cache-Control', 'private, no-store')
  async document(@CurrentUser() user: UserAccessContext, @Param('documentId') documentId: string) {
    const document = await this.checkout.myDocumentFile(user, documentId);
    return new StreamableFile(document.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${document.filename}"`,
      length: document.content.length,
    });
  }
}
