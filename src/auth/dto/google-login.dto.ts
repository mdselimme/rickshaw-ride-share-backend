import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token issued to the mobile client',
    maxLength: 8192,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken!: string;
}
