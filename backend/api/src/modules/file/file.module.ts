import { Module } from '@nestjs/common';
import { AuditModule } from '../../infrastructure/audit/audit.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { FILE_STORAGE_PROVIDER } from './constants/file.constants';
import { FileController } from './file.controller';
import { FileRepository } from './file.repository';
import { FileService } from './file.service';
import { LocalFileStorage } from './storage/local-file-storage';

@Module({
  imports: [AuditModule, PropertyModule, RbacModule, RedisModule],
  controllers: [FileController],
  providers: [
    FileRepository,
    FileService,
    LocalFileStorage,
    {
      provide: FILE_STORAGE_PROVIDER,
      useExisting: LocalFileStorage,
    },
  ],
  exports: [FileService, FileRepository],
})
export class FileModule {}
