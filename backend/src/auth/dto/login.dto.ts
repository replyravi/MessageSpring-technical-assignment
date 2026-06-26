import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  // Honeypot. The UI hides this field from real users, so a non-empty value
  // means a bot filled in everything on the form. Validated as a normal
  // optional string; the actual rejection happens in AuthService.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
