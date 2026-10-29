import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/http-exception.filter';

/** Shared by main.ts and the e2e tests so both run the exact same app. */
export function setupApp(app: INestApplication) {
  app.enableCors();
  app.enableShutdownHooks();
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const docs = new DocumentBuilder()
    .setTitle('Antri API')
    .setDescription('Virtual queue backend: venues, tickets, staff console and live updates (Socket.io)')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, docs));
  return app;
}
