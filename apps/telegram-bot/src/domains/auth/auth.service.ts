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
