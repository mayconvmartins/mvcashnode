import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import * as path from 'path';
import { config } from 'dotenv';
import * as fs from 'fs';
import { NtpService, TimezoneService } from '@mvcashnode/shared';

// Carregar .env da raiz do projeto antes de inicializar o NestJS
// Tentar múltiplos caminhos possíveis
const possiblePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../.env'),
];

let envLoaded = false;
for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    const result = config({ path: envPath });
    if (result.parsed && Object.keys(result.parsed).length > 0) {
      envLoaded = true;
      console.log(`[dotenv] Loaded .env from: ${envPath}`);
      break;
    }
  }
}

if (!envLoaded) {
  console.warn('[dotenv] Warning: .env file not found or empty. Tried paths:', possiblePaths);
}

async function bootstrap() {
  // Inicializar serviços de tempo
  const ntpEnabled = process.env.NTP_ENABLED === 'true';
  const ntpServer = process.env.NTP_SERVER || 'pool.ntp.org';
  const ntpSyncInterval = parseInt(process.env.NTP_SYNC_INTERVAL || '3600000');
  const timezone = process.env.TIMEZONE || 'America/Sao_Paulo'; // Timezone padrão: São Paulo

  const ntpService = new NtpService(ntpServer, ntpSyncInterval, ntpEnabled);
  const timezoneService = new TimezoneService(timezone);

  if (ntpEnabled) {
    // Sincronizar IMEDIATAMENTE antes de configurar adapters
    console.log(`[NTP] Sincronizando com ${ntpServer}...`);
    await ntpService.sync();
    const ntpInfo = ntpService.getInfo();
    console.log(`[NTP] Offset atual: ${ntpInfo.offset}ms`);
    
    // Iniciar sincronização periódica
    ntpService.startPeriodicSync();
    console.log(`[NTP] Serviço iniciado - servidor: ${ntpServer}, intervalo: ${ntpSyncInterval}ms`);
  } else {
    console.warn('[NTP] ⚠️ NTP desabilitado - timestamps podem estar incorretos!');
  }

  console.log(`[Timezone] Configurado: ${timezone}`);
  console.log(`[Timezone] Info:`, timezoneService.getInfo());

  // Configurar AdapterFactory com o NtpService ANTES de criar qualquer adapter
  const { AdapterFactory } = await import('@mvcashnode/exchange');
  AdapterFactory.setNtpService(ntpService);
  console.log('[Exchange] ✅ AdapterFactory configurado para usar NTP Service');

  const app = await NestFactory.create(AppModule);

  // Configuração de CORS
  const corsDisabled = process.env.CORS_DISABLED === 'true';
  if (corsDisabled) {
    app.enableCors({
      origin: true, // Permite todas as origens
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    console.log('[CORS] CORS desabilitado - permitindo todas as origens');
  } else {
    app.enableCors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    console.log(`[CORS] CORS habilitado - origem permitida: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger/OpenAPI
  const config = new DocumentBuilder()
    .setTitle('Trading Automation API')
    .setDescription('API de automação de trading para exchanges')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Auth', 'Autenticação e gerenciamento de usuários')
    .addTag('Exchange Accounts', 'Contas de exchange')
    .addTag('Vaults', 'Cofres virtuais')
    .addTag('Positions', 'Posições abertas e fechadas')
    .addTag('Webhooks', 'Fontes de webhook e eventos')
    .addTag('Reports', 'Relatórios de PnL e performance')
    .addTag('Monitoring', 'Monitoramento do sistema e alertas')
    .addTag('Admin', 'Administração do sistema')
    .addServer('http://localhost:4010', 'Desenvolvimento Local')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // JSON export
  app.use('/api-docs/json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(document);
  });

  const port = process.env.API_PORT || 4010;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api-docs`);
}

bootstrap();

