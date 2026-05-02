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
