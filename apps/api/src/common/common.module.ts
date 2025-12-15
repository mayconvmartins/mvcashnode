import { Module, Global } from '@nestjs/common';
import { PriceCacheService } from './services/price-cache.service';
import { ApiCacheService } from './services/api-cache.service';

@Global()
@Module({
  providers: [PriceCacheService, ApiCacheService],
  exports: [PriceCacheService, ApiCacheService],
})
export class CommonModule {}

