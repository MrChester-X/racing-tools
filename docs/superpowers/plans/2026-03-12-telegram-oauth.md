# Telegram OAuth 2.0 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram OAuth 2.0 (OIDC) authentication with user persistence to the Racing application.

**Architecture:** Frontend opens a popup to Telegram's OAuth endpoint, receives an authorization code, sends it to our NestJS backend which exchanges it for an id_token, validates it via JWKS, upserts the user in PostgreSQL, and returns our own JWT. Guards and decorators are prepared but not applied to existing endpoints.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, @nestjs/jwt, @nestjs/passport, passport-jwt, jwks-rsa, Next.js, Zustand, Axios

**Spec:** `docs/superpowers/specs/2026-03-11-telegram-oauth-design.md`

---

## File Structure

### Backend (`telegram-race-timer/src/domains/auth/`)

| File | Responsibility |
|------|---------------|
| `auth.module.ts` | Auth module registration, imports JwtModule, PassportModule |
| `user.entity.ts` | User TypeORM entity with role as string column |
| `user-role.enum.ts` | UserRole enum (USER, ADMIN) |
| `auth.controller.ts` | POST /auth/telegram, GET /auth/me |
| `auth.service.ts` | Code exchange, JWKS validation, upsert user, JWT generation |
| `dto/telegram-auth.dto.ts` | DTO for POST /auth/telegram request body |
| `dto/auth-response.dto.ts` | DTO for auth response (access_token + user) |
| `guards/jwt-auth.guard.ts` | JwtAuthGuard extending AuthGuard('jwt') |
| `guards/roles.guard.ts` | RolesGuard checking user role |
| `strategies/jwt.strategy.ts` | Passport JWT strategy |
| `decorators/auth.decorator.ts` | @Auth() shorthand decorator |
| `decorators/current-user.decorator.ts` | @CurrentUser() param decorator |
| `decorators/roles.decorator.ts` | @Roles() decorator |

### Frontend (`race-time-front/src/`)

| File | Responsibility |
|------|---------------|
| `lib/api.ts` | Centralized axios instance with auth interceptor |
| `lib/pkce.ts` | PKCE code_verifier/code_challenge generation |
| `store/useAuthStore.ts` | Auth Zustand store (login, logout, checkAuth) |
| `app/auth/callback/page.tsx` | OAuth callback page (extracts code, postMessage to opener) |
| `components/AuthButton.tsx` | "Войти через Telegram" / user avatar + logout button |
| `app/layout.tsx` | Modified: add AuthButton + auth init |

---

## Chunk 1: Backend Auth Infrastructure

### Task 1: Install backend dependencies

**Files:**
- Modify: `telegram-race-timer/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd D:/Projects/Other/Racing/telegram-race-timer
npm install @nestjs/jwt @nestjs/passport passport passport-jwt jwks-rsa jsonwebtoken
npm install -D @types/passport-jwt @types/jsonwebtoken
```

- [ ] **Step 2: Verify installation**

Run: `cd D:/Projects/Other/Racing/telegram-race-timer && node -e "require('@nestjs/jwt'); require('jwks-rsa'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/Other/Racing/telegram-race-timer
git add package.json package-lock.json
git commit -m "feat(auth): install JWT, Passport, and JWKS dependencies"
```

---

### Task 2: Create User entity and UserRole enum

**Files:**
- Create: `telegram-race-timer/src/domains/auth/user-role.enum.ts`
- Create: `telegram-race-timer/src/domains/auth/user.entity.ts`

- [ ] **Step 1: Create UserRole enum**

Create `telegram-race-timer/src/domains/auth/user-role.enum.ts`:

```typescript
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}
```

- [ ] **Step 2: Create User entity**

Create `telegram-race-timer/src/domains/auth/user.entity.ts`:

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from './user-role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  telegramId: string;

  @Column({ type: 'varchar', nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', nullable: true })
  username: string | null;

  @Column({ type: 'varchar', nullable: true })
  photo: string | null;

  @Column({ type: 'varchar', default: UserRole.USER })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/Other/Racing/telegram-race-timer
git add src/domains/auth/user-role.enum.ts src/domains/auth/user.entity.ts
git commit -m "feat(auth): add User entity and UserRole enum"
```

---

### Task 3: Create DTOs

**Files:**
- Create: `telegram-race-timer/src/domains/auth/dto/telegram-auth.dto.ts`
- Create: `telegram-race-timer/src/domains/auth/dto/auth-response.dto.ts`

- [ ] **Step 1: Create request DTO**

Create `telegram-race-timer/src/domains/auth/dto/telegram-auth.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class TelegramAuthDto {
  @ApiProperty({ description: 'Authorization code from Telegram OAuth' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'PKCE code verifier' })
  @IsString()
  @IsNotEmpty()
  code_verifier: string;

  @ApiProperty({ description: 'Redirect URI used in the authorization request' })
  @IsString()
  @IsNotEmpty()
  redirect_uri: string;
}
```

- [ ] **Step 2: Create response DTO**

Create `telegram-race-timer/src/domains/auth/dto/auth-response.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';

class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  telegramId: string;

  @ApiProperty({ nullable: true })
  firstName: string | null;

  @ApiProperty({ nullable: true })
  lastName: string | null;

  @ApiProperty({ nullable: true })
  username: string | null;

  @ApiProperty({ nullable: true })
  photo: string | null;

  @ApiProperty()
  role: string;
}

export class AuthResponseDto {
  @ApiProperty()
  access_token: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
```

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/Other/Racing/telegram-race-timer
git add src/domains/auth/dto/
git commit -m "feat(auth): add Telegram auth DTOs"
```

---

### Task 4: Create AuthService

**Files:**
- Create: `telegram-race-timer/src/domains/auth/auth.service.ts`

- [ ] **Step 1: Create AuthService**

Create `telegram-race-timer/src/domains/auth/auth.service.ts`:

```typescript
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as jwksRsa from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';
import { TelegramAuthDto } from './dto/telegram-auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwksClient: jwksRsa.JwksClient;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly allowedRedirectUris: string[];

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.clientId = this.configService.getOrThrow<string>('TELEGRAM_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>('TELEGRAM_CLIENT_SECRET');
    this.allowedRedirectUris = this.configService
      .getOrThrow<string>('ALLOWED_REDIRECT_URIS')
      .split(',')
      .map((uri) => uri.trim());

    this.jwksClient = jwksRsa({
      jwksUri: 'https://oauth.telegram.org/.well-known/jwks.json',
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
    });
  }

  async authenticateWithTelegram(dto: TelegramAuthDto) {
    this.validateRedirectUri(dto.redirect_uri);

    const idToken = await this.exchangeCode(dto.code, dto.code_verifier, dto.redirect_uri);
    const telegramUser = await this.validateTelegramToken(idToken);
    const user = await this.upsertUser(telegramUser);
    const accessToken = this.generateJwt(user);

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        photo: user.photo,
        role: user.role,
      },
    };
  }

  async findUserById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  private validateRedirectUri(redirectUri: string) {
    if (!this.allowedRedirectUris.includes(redirectUri)) {
      throw new UnauthorizedException('Invalid redirect URI');
    }
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<string> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    try {
      const response = await axios.post(
        'https://oauth.telegram.org/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: this.clientId,
          code_verifier: codeVerifier,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`,
          },
        },
      );

      return response.data.id_token;
    } catch (error) {
      this.logger.error('Failed to exchange code with Telegram', error?.response?.data || error);
      throw new UnauthorizedException('Failed to authenticate with Telegram');
    }
  }

  private async validateTelegramToken(idToken: string): Promise<{
    telegramId: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    photo: string | null;
  }> {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || !decoded.header.kid) {
      throw new UnauthorizedException('Invalid id_token');
    }

    const key = await this.jwksClient.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    const payload = jwt.verify(idToken, publicKey, {
      issuer: 'https://oauth.telegram.org',
      audience: this.clientId,
    }) as Record<string, any>;

    return {
      telegramId: String(payload.id || payload.sub),
      firstName: payload.name || payload.given_name || null,
      lastName: payload.family_name || null,
      username: payload.preferred_username || null,
      photo: payload.picture || null,
    };
  }

  private async upsertUser(telegramUser: {
    telegramId: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    photo: string | null;
  }): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { telegramId: telegramUser.telegramId },
    });

    if (user) {
      user.firstName = telegramUser.firstName;
      user.lastName = telegramUser.lastName;
      user.username = telegramUser.username;
      user.photo = telegramUser.photo;
      return this.userRepository.save(user);
    }

    user = this.userRepository.create({
      ...telegramUser,
      role: UserRole.USER,
    });
    return this.userRepository.save(user);
  }

  private generateJwt(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      role: user.role,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/Projects/Other/Racing/telegram-race-timer
git add src/domains/auth/auth.service.ts
git commit -m "feat(auth): add AuthService with Telegram OIDC exchange and JWKS validation"
```

---

### Task 5: Create JWT strategy

**Files:**
- Create: `telegram-race-timer/src/domains/auth/strategies/jwt.strategy.ts`

- [ ] **Step 1: Create JWT strategy**

Create `telegram-race-timer/src/domains/auth/strategies/jwt.strategy.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; role: string }) {
    const user = await this.authService.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/Projects/Other/Racing/telegram-race-timer
git add src/domains/auth/strategies/jwt.strategy.ts
git commit -m "feat(auth): add Passport JWT strategy"
```

---

### Task 6: Create guards and decorators

**Files:**
- Create: `telegram-race-timer/src/domains/auth/guards/jwt-auth.guard.ts`
- Create: `telegram-race-timer/src/domains/auth/guards/roles.guard.ts`
- Create: `telegram-race-timer/src/domains/auth/decorators/auth.decorator.ts`
- Create: `telegram-race-timer/src/domains/auth/decorators/current-user.decorator.ts`
- Create: `telegram-race-timer/src/domains/auth/decorators/roles.decorator.ts`

- [ ] **Step 1: Create JwtAuthGuard**

Create `telegram-race-timer/src/domains/auth/guards/jwt-auth.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 2: Create RolesGuard**

Create `telegram-race-timer/src/domains/auth/guards/roles.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
```

- [ ] **Step 3: Create @Auth() decorator**

Create `telegram-race-timer/src/domains/auth/decorators/auth.decorator.ts`:

```typescript
import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

export function Auth() {
  return applyDecorators(UseGuards(JwtAuthGuard), ApiBearerAuth());
}
```

- [ ] **Step 4: Create @CurrentUser() decorator**

Create `telegram-race-timer/src/domains/auth/decorators/current-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../user.entity';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 5: Create @Roles() decorator**

Create `telegram-race-timer/src/domains/auth/decorators/roles.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 6: Commit**

```bash
cd D:/Projects/Other/Racing/telegram-race-timer
git add src/domains/auth/guards/ src/domains/auth/decorators/
git commit -m "feat(auth): add JwtAuthGuard, RolesGuard, @Auth, @CurrentUser, @Roles decorators"
```

---

### Task 7: Create AuthController

**Files:**
- Create: `telegram-race-timer/src/domains/auth/auth.controller.ts`

- [ ] **Step 1: Create AuthController**

Create `telegram-race-timer/src/domains/auth/auth.controller.ts`:

```typescript
import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from './user.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('telegram')
  @ApiOperation({ summary: 'Authenticate via Telegram OAuth 2.0' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  async telegramAuth(@Body() dto: TelegramAuthDto): Promise<AuthResponseDto> {
    return this.authService.authenticateWithTelegram(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: User) {
    return {
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      photo: user.photo,
      role: user.role,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/Projects/Other/Racing/telegram-race-timer
git add src/domains/auth/auth.controller.ts
git commit -m "feat(auth): add AuthController with telegram login and /me endpoints"
```

---

### Task 8: Create AuthModule and wire into app

**Files:**
- Create: `telegram-race-timer/src/domains/auth/auth.module.ts`
- Modify: `telegram-race-timer/src/domains/domains.module.ts`
- Modify: `telegram-race-timer/.env.example`

- [ ] **Step 1: Create AuthModule**

Create `telegram-race-timer/src/domains/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 2: Register AuthModule in DomainsModule**

Modify `telegram-race-timer/src/domains/domains.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ParserModule } from './parser/parser.module';
import { VideoJobsModule } from './video-jobs/video-jobs.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [/* HandlerModule, */ ParserModule, VideoJobsModule, AuthModule],
})
export class DomainsModule {}
```

- [ ] **Step 3: Add new env vars to .env.example**

Append to `telegram-race-timer/.env.example`:

```env
# Auth
TELEGRAM_CLIENT_ID=your_bot_client_id
TELEGRAM_CLIENT_SECRET=your_bot_client_secret
JWT_SECRET=your_jwt_secret
ALLOWED_REDIRECT_URIS=http://localhost:3001/auth/callback
```

- [ ] **Step 4: Add ValidationPipe to main.ts**

Modify `telegram-race-timer/src/main.ts` — surgical edit, do NOT replace the whole file:

1. Add import at the top: `import { Logger, ValidationPipe } from '@nestjs/common';` (merge with existing `Logger` import)
2. Add this line right after `app.enableCors({ origin: '*' });`:
   ```typescript
   app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
   ```
3. Leave everything else unchanged (body parser limits, Swagger setup, Logger, etc.)

- [ ] **Step 5: Verify backend compiles**

Run: `cd D:/Projects/Other/Racing/telegram-race-timer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd D:/Projects/Other/Racing/telegram-race-timer
git add src/domains/auth/auth.module.ts src/domains/domains.module.ts .env.example src/main.ts
git commit -m "feat(auth): wire AuthModule into app, add ValidationPipe, update .env.example"
```

---

## Chunk 2: Frontend Auth

### Task 9: Create PKCE utility

**Files:**
- Create: `race-time-front/src/lib/pkce.ts`

- [ ] **Step 1: Create PKCE helper**

Create `race-time-front/src/lib/pkce.ts`:

```typescript
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array.buffer);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array.buffer);
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/Projects/Other/Racing/race-time-front
git add src/lib/pkce.ts
git commit -m "feat(auth): add PKCE code_verifier/code_challenge utilities"
```

---

### Task 10: Create centralized API client

**Files:**
- Create: `race-time-front/src/lib/api.ts`

- [ ] **Step 1: Create axios instance with auth interceptor**

Create `race-time-front/src/lib/api.ts`:

```typescript
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});
```

- [ ] **Step 2: Commit**

```bash
cd D:/Projects/Other/Racing/race-time-front
git add src/lib/api.ts
git commit -m "feat(auth): add centralized axios instance with Bearer token interceptor"
```

---

### Task 11: Create Auth store

**Files:**
- Create: `race-time-front/src/store/useAuthStore.ts`

- [ ] **Step 1: Create useAuthStore**

Create `race-time-front/src/store/useAuthStore.ts`:

```typescript
import { create } from 'zustand';
import { api } from '@/lib/api';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '@/lib/pkce';

const TELEGRAM_CLIENT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID || '';

interface AuthUser {
  id: string;
  telegramId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  photo: string | null;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null,
  isAuthenticated: false,
  isLoading: false,

  login: async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Store PKCE and state for validation after callback
    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);

    const redirectUri = `${window.location.origin}/auth/callback`;

    const params = new URLSearchParams({
      client_id: TELEGRAM_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `https://oauth.telegram.org/auth?${params.toString()}`;

    // Open popup
    const width = 550;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      authUrl,
      'telegram-auth',
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    // Listen for callback message
    return new Promise<void>((resolve, reject) => {
      let pollTimer: ReturnType<typeof setInterval>;

      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'telegram-auth-callback') return;

        window.removeEventListener('message', handleMessage);
        clearInterval(pollTimer);

        const { code, state: returnedState, error } = event.data;

        if (error) {
          reject(new Error(error));
          return;
        }

        const savedState = sessionStorage.getItem('oauth_state');
        if (returnedState !== savedState) {
          reject(new Error('State mismatch — possible CSRF attack'));
          return;
        }

        const savedVerifier = sessionStorage.getItem('oauth_code_verifier');
        sessionStorage.removeItem('oauth_code_verifier');
        sessionStorage.removeItem('oauth_state');

        try {
          set({ isLoading: true });
          const response = await api.post('/auth/telegram', {
            code,
            code_verifier: savedVerifier,
            redirect_uri: redirectUri,
          });

          const { access_token, user } = response.data;
          localStorage.setItem('auth_token', access_token);
          set({ token: access_token, user, isAuthenticated: true, isLoading: false });
          resolve();
        } catch (err) {
          set({ isLoading: false });
          reject(err);
        }
      };

      window.addEventListener('message', handleMessage);

      // Poll for popup closed without auth
      pollTimer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          set({ isLoading: false });
          resolve(); // User closed popup, no error
        }
      }, 500);
    });
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }

    try {
      set({ isLoading: true });
      const response = await api.get('/auth/me');
      set({ user: response.data, token, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('auth_token');
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
```

- [ ] **Step 2: Commit**

```bash
cd D:/Projects/Other/Racing/race-time-front
git add src/store/useAuthStore.ts
git commit -m "feat(auth): add Zustand auth store with Telegram OAuth popup flow"
```

---

### Task 12: Create OAuth callback page

**Files:**
- Create: `race-time-front/src/app/auth/callback/page.tsx`

- [ ] **Step 1: Create callback page**

Create `race-time-front/src/app/auth/callback/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';

export default function AuthCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'telegram-auth-callback',
          code,
          state,
          error,
        },
        window.location.origin,
      );
      window.close();
    } else {
      // Direct navigation — redirect to home
      window.location.href = '/';
    }
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Авторизация... Окно закроется автоматически.</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/Projects/Other/Racing/race-time-front
git add src/app/auth/callback/page.tsx
git commit -m "feat(auth): add OAuth callback page for popup flow"
```

---

### Task 13: Create AuthButton component and integrate into layout

**Files:**
- Create: `race-time-front/src/components/AuthButton.tsx`
- Modify: `race-time-front/src/app/layout.tsx`
- Modify: `race-time-front/src/.env.local`

- [ ] **Step 1: Create AuthButton component**

Create `race-time-front/src/components/AuthButton.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

export function AuthButton() {
  const { user, isAuthenticated, isLoading, login, logout, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return <div className="text-sm text-gray-400">Загрузка...</div>;
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-3">
        {user.photo && (
          <img
            src={user.photo}
            alt={user.firstName || 'User'}
            className="w-8 h-8 rounded-full"
          />
        )}
        <span className="text-sm text-white">
          {user.firstName || user.username || 'User'}
        </span>
        <button
          onClick={logout}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Выйти
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => login().catch(() => {})}
      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
    >
      Войти через Telegram
    </button>
  );
}
```

- [ ] **Step 2: Integrate AuthButton into layout**

Modify `race-time-front/src/app/layout.tsx` — wrap children in a layout with header containing AuthButton:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthButton } from "@/components/AuthButton";

// ... keep existing font and metadata config unchanged ...

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="flex items-center justify-end p-4">
          <AuthButton />
        </header>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Add TELEGRAM_CLIENT_ID to frontend .env.local**

Manually append to `race-time-front/.env.local` (do NOT commit this file — it contains local config):

```env
NEXT_PUBLIC_TELEGRAM_CLIENT_ID=your_bot_client_id
```

- [ ] **Step 4: Verify frontend compiles**

Run: `cd D:/Projects/Other/Racing/race-time-front && npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/Other/Racing/race-time-front
git add src/components/AuthButton.tsx src/app/layout.tsx
git commit -m "feat(auth): add AuthButton component and integrate into layout"
```

---

## Chunk 3: Final verification

### Task 14: End-to-end manual verification

- [ ] **Step 1: Add real credentials to .env files**

Add `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET`, `JWT_SECRET` to `telegram-race-timer/.env`.
Add `NEXT_PUBLIC_TELEGRAM_CLIENT_ID` to `race-time-front/.env.local`.

- [ ] **Step 2: Start backend**

Run: `cd D:/Projects/Other/Racing/telegram-race-timer && npm run start:dev`
Expected: Starts on port 3000, no errors. Check Swagger at `http://localhost:3000/docs` — should show `auth` tag with two endpoints.

- [ ] **Step 3: Start frontend**

Run: `cd D:/Projects/Other/Racing/race-time-front && npm run dev`
Expected: Starts on port 3000 (or 3001). AuthButton visible in top-right corner.

- [ ] **Step 4: Test login flow**

1. Click "Войти через Telegram"
2. Popup opens to Telegram OAuth
3. Approve login in Telegram
4. Popup closes, user data appears in header
5. Refresh page — user still logged in (checkAuth via /auth/me)

- [ ] **Step 5: Test logout**

1. Click "Выйти"
2. User data disappears, "Войти через Telegram" button reappears
3. Refresh page — still logged out

- [ ] **Step 6: Verify user in DB**

Run: `psql -d racing -c "SELECT id, telegram_id, first_name, username, role FROM users;"`
Expected: One row with your Telegram data and role = 'user'

- [ ] **Step 7: Final commit (if any env/config tweaks)**

```bash
git add -A
git commit -m "feat(auth): finalize Telegram OAuth 2.0 integration"
```
