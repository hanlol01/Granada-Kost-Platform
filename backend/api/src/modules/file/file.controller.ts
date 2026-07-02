import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { MAX_UPLOAD_BYTES } from './constants/file.constants';
import { FileQueryDto } from './dto/file-query.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileService } from './file.service';
import type { UploadedFileBuffer } from './types/file.types';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('files')
export class FileController {
  constructor(private readonly files: FileService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
      },
    }),
  )
  async upload(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: UploadFileDto,
    @UploadedFile() file: UploadedFileBuffer | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    const record = await this.files.upload(user, dto, file, this.auditContext(user, request));
    return this.files.toResponse(record);
  }

  @Get(':fileId')
  async get(
    @CurrentUser() user: UserAccessContext,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const record = await this.files.getMetadata(user, fileId, this.auditContext(user, request));
    return this.files.toResponse(record);
  }

  @Get(':fileId/content')
  @Header('X-Content-Type-Options', 'nosniff')
  async content(
    @CurrentUser() user: UserAccessContext,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Query() query: FileQueryDto,
    @Req() request: RequestWithCorrelationId,
    @Res() response: Response,
  ) {
    const { record, buffer } = await this.files.readContent(user, fileId, this.auditContext(user, request));
    const disposition = query.download ? 'attachment' : 'inline';
    response.setHeader('Content-Type', record.mimeType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${this.contentDispositionFilename(record.sanitizedFilename)}"`,
    );
    response.send(buffer);
  }

  @Delete(':fileId')
  async delete(
    @CurrentUser() user: UserAccessContext,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const result = await this.files.softDelete(user, fileId, this.auditContext(user, request));
    return {
      success: result.success,
      file: this.files.toResponse(result.file),
    };
  }

  private auditContext(user: UserAccessContext, request: RequestWithCorrelationId) {
    return {
      actorUserId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }

  private contentDispositionFilename(filename: string): string {
    return filename.replace(/["\\\r\n]/g, '_');
  }
}
