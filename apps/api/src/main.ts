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

  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Desabilitar body parser padrão globalmente
  });
  
  // Aplicar body parsers customizados - IMPORTANTE: aplicar ANTES de qualquer outro middleware
  const bodyParser = require('body-parser');
  
  // Para rotas de webhook, usar parser que captura raw body
  // Aplicar diretamente na rota /webhooks
  app.use('/webhooks', bodyParser.raw({ 
    type: '*/*',
    limit: '10mb',
    verify: (req: any, res: any, buf: Buffer) => {
      // Salvar o buffer raw
      req.rawBody = buf;
      const contentType = req.headers['content-type'] || '';
      const bodyStr = buf.toString('utf8');
      
      console.log(`[WEBHOOK-MIDDLEWARE] ✅ Middleware executado!`);
      console.log(`[WEBHOOK-MIDDLEWARE] Content-Type: ${contentType}`);
      console.log(`[WEBHOOK-MIDDLEWARE] Raw body capturado (${buf.length} bytes): "${bodyStr.substring(0, 200)}${bodyStr.length > 200 ? '...' : ''}"`);
      
      // Processar baseado no Content-Type
      if (contentType.includes('text/plain')) {
        req.body = bodyStr;
        console.log(`[WEBHOOK-MIDDLEWARE] Body definido como string: "${req.body}"`);
      } else if (contentType.includes('application/json')) {
        try {
          req.body = JSON.parse(bodyStr);
          console.log(`[WEBHOOK-MIDDLEWARE] Body parseado como JSON`);
        } catch (e) {
          req.body = bodyStr;
          console.log(`[WEBHOOK-MIDDLEWARE] Body definido como string (JSON parse falhou)`);
        }
      } else {
        // Tentar JSON primeiro, depois string
        try {
          req.body = JSON.parse(bodyStr);
          console.log(`[WEBHOOK-MIDDLEWARE] Body parseado como JSON (tentativa)`);
        } catch (e) {
          req.body = bodyStr;
          console.log(`[WEBHOOK-MIDDLEWARE] Body definido como string (fallback)`);
        }
      }
    }
  }));
  
  // Para outras rotas, usar body parser JSON padrão
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  
  console.log('[WEBHOOK-MIDDLEWARE] ✅ Middleware de raw body configurado para /webhooks/*');

  // Configuração de CORS
  const corsDisabled = process.env.CORS_DISABLED === 'true';
  if (corsDisabled) {
    app.enableCors({
      origin: true, // Permite todas as origens
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers',
      ],
      exposedHeaders: ['Content-Length', 'Content-Type'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });
    console.log('[CORS] ✅ CORS desabilitado - permitindo todas as origens');
  } else {
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://localhost:5010'];
    
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers',
      ],
      exposedHeaders: ['Content-Length', 'Content-Type'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });
    console.log(`[CORS] ✅ CORS habilitado - origens permitidas: ${allowedOrigins.join(', ')}`);
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

