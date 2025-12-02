import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

