import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { UserAccessContext } from '../iam/types/iam.types';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { UpdatePropertyDocumentSettingsDto } from './dto/update-property-document-settings.dto';
import { DocumentSettingsService } from './document-settings.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('admin')
@RequirePermissions('property_owner.manage')
@Controller('properties/:propertyId')
export class DocumentSettingsController {
  constructor(private readonly settings: DocumentSettingsService) {}

  @Get('organization-settings')
  getOrganization(
    @CurrentUser() user: UserAccessContext,
    @Param('propertyId') propertyId: string,
  ) {
    return this.settings.getOrganization(user, propertyId);
  }

  @Patch('organization-settings')
  updateOrganization(
    @CurrentUser() user: UserAccessContext,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdateOrganizationSettingsDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.settings.updateOrganization(user, propertyId, dto, this.auditContext(request));
  }

  @Get('document-settings')
  getDocumentSettings(
    @CurrentUser() user: UserAccessContext,
    @Param('propertyId') propertyId: string,
  ) {
    return this.settings.getPropertyDocumentSettings(user, propertyId);
  }

  @Patch('document-settings')
  updateDocumentSettings(
    @CurrentUser() user: UserAccessContext,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyDocumentSettingsDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.settings.updatePropertyDocumentSettings(user, propertyId, dto, this.auditContext(request));
  }

  private auditContext(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
