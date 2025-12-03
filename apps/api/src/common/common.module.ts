import { Module, Global } from '@nestjs/common';
import { PriceCacheService } from './services/price-cache.service';

@Global()
@Module({
  providers: [PriceCacheService],
  exports: [PriceCacheService],
})
export class CommonModule {}

