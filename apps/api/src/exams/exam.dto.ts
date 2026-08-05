import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ExamAccessDto {
  @IsString() @Length(0, 128) password = '';
  @IsOptional() @IsBoolean() standardBrowserFallback?: boolean;
}
export class StartAttemptDto {
  @IsUUID() examId!: string;
  @IsString() @Length(8, 120) authorizationToken!: string;
  @IsString() @Length(8, 120) idempotencyKey!: string;
}
export class AttemptActionDto {
  @IsString() @Length(4, 240) reason!: string;
}
export class ExtendAttemptDto extends AttemptActionDto {
  @Transform(({ value }) => Number(value)) @IsInt() @Min(60) @Max(7200) seconds!: number;
}
export class PublishResultsDto {
  @IsBoolean() published!: boolean;
  @IsString() @Length(4, 240) reason!: string;
}
export class SubmitAttemptDto {
  @IsString() @Length(8, 120) idempotencyKey!: string;
}
export class SectionTransitionDto {
  @IsInt() @Min(0) nextSectionIndex!: number;
}
export class ExamStatusDto {
  @IsEnum(['published', 'cancelled', 'archived']) status!: 'published' | 'cancelled' | 'archived';
  @IsString() @Length(4, 240) reason!: string;
}
export class NotificationAnnouncementDto {
  @IsString() @Length(3, 160) title!: string;
  @IsString() @Length(3, 4000) message!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('4', { each: true }) programIds?: string[];
}
