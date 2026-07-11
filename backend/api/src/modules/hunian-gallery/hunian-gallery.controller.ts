import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { acceptsAdminUxV2 } from '../../shared/admin-ux-v2';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CreateHunianGalleryImageDto } from './dto/create-hunian-gallery-image.dto';
import { ListHunianGalleryQueryDto } from './dto/list-hunian-gallery-query.dto';
import { ReorderHunianGalleryDto } from './dto/reorder-hunian-gallery.dto';
import { UpdateHunianGalleryImageDto } from './dto/update-hunian-gallery-image.dto';
import { HunianGalleryService } from './hunian-gallery.service';
import { AdminUxGalleryV2Service } from '../admin-ux-master/admin-ux-gallery-v2.service';
import type {
  CreateHunianGalleryV2Dto,
  ListHunianGalleryV2QueryDto,
  ReorderHunianGalleryV2Dto,
} from '../admin-ux-master/admin-ux-gallery-v2.dto';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hunian-gallery')
export class HunianGalleryController {
  constructor(
    private readonly gallery: HunianGalleryService,
    private readonly galleryV2: AdminUxGalleryV2Service,
  ) {}

  @Get()
  @RequireRoles('owner', 'manager', 'admin', 'property_owner')
  @RequirePermissions('room.read')
  list(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListHunianGalleryQueryDto,
    @Headers('accept') accept?: string,
  ) {
    if (acceptsAdminUxV2(accept)) {
      return this.galleryV2.list(user, query as ListHunianGalleryV2QueryDto);
    }
    return this.gallery.list(user, query);
  }

  @Post()
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateHunianGalleryImageDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    if (acceptsAdminUxV2(request.headers.accept)) {
      return this.galleryV2.create(
        user,
        dto as CreateHunianGalleryV2Dto,
        this.contextFromRequest(request),
      );
    }
    return this.gallery.create(user, dto, this.contextFromRequest(request));
  }

  @Patch(':imageId')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Body() dto: UpdateHunianGalleryImageDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    if (acceptsAdminUxV2(request.headers.accept)) {
      return this.galleryV2.update(user, imageId, dto, this.contextFromRequest(request));
    }
    return this.gallery.update(user, imageId, dto, this.contextFromRequest(request));
  }

  @Post(':imageId/set-cover')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  setCover(
    @CurrentUser() user: UserAccessContext,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    if (acceptsAdminUxV2(request.headers.accept)) {
      return this.galleryV2.setCover(user, imageId, this.contextFromRequest(request));
    }
    return this.gallery.setCover(user, imageId, this.contextFromRequest(request));
  }

  @Post('reorder')
  @Put('reorder')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  reorder(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: ReorderHunianGalleryDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    if (acceptsAdminUxV2(request.headers.accept)) {
      return this.galleryV2.reorder(
        user,
        dto as ReorderHunianGalleryV2Dto,
        this.contextFromRequest(request),
      );
    }
    return this.gallery.reorder(user, dto, this.contextFromRequest(request));
  }

  @Delete(':imageId')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  delete(
    @CurrentUser() user: UserAccessContext,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    if (acceptsAdminUxV2(request.headers.accept)) {
      return this.galleryV2.remove(user, imageId, this.contextFromRequest(request));
    }
    return this.gallery.delete(user, imageId, this.contextFromRequest(request));
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
