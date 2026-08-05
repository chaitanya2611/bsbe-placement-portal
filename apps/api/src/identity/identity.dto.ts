import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const lowerEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class RequestOtpDto {
  @Transform(lowerEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class VerifyOtpDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}

export class CreateProgramDto {
  @Transform(upper)
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  code!: string;

  @Transform(trimmed)
  @IsString()
  @Length(1, 120)
  name!: string;
}

export class CreateUserDto {
  @Transform(lowerEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 160)
  fullName!: string;

  @IsEnum(['student', 'admin'])
  role!: 'student' | 'admin';

  @Transform(upper)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9][A-Z0-9._/-]*$/)
  rollNumber?: string;

  @IsOptional()
  @IsUUID()
  programId?: string;
}

export class UpdateAccountStatusDto {
  @IsEnum(['active', 'inactive'])
  status!: 'active' | 'inactive';

  @Transform(trimmed)
  @IsString()
  @Length(4, 240)
  reason!: string;
}

export class RevokeSessionDto {
  @Transform(trimmed)
  @IsString()
  @Length(4, 240)
  reason!: string;
}

export class ListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 50;

  @Transform(trimmed)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;
}

export class SetProgramStatusDto {
  @IsBoolean()
  active!: boolean;

  @Transform(trimmed)
  @IsNotEmpty()
  @IsString()
  @MaxLength(240)
  reason!: string;
}
