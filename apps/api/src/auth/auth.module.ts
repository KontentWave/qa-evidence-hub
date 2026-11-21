import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthAndCsrfGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { LoginThrottlerService } from './login-throttler.service';
import { PasswordHasherService } from './password-hasher.service';

@Module({
  controllers: [AuthController],
  providers: [
    PasswordHasherService,
    CsrfService,
    LoginThrottlerService,
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthAndCsrfGuard,
    },
  ],
  exports: [AuthService, CsrfService, PasswordHasherService, LoginThrottlerService],
})
export class AuthModule {}
