import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { config } from './config';

async function bootstrap() {
  const app = setupApp(await NestFactory.create(AppModule));
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API on http://localhost:${config.port}  (docs: /docs)`, 'Bootstrap');
}

void bootstrap();
