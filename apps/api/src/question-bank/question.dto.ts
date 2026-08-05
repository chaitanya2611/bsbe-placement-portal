import type { QuestionDifficulty, QuestionStatus, QuestionType } from '@bsbe/contracts';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ListQuestionsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 50;

  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  @IsOptional()
  search?: string;

  @IsEnum(['single-choice', 'multiple-select', 'true-false', 'numerical'])
  @IsOptional()
  type?: QuestionType;

  @IsEnum(['easy', 'medium', 'hard'])
  @IsOptional()
  difficulty?: QuestionDifficulty;

  @IsEnum(['draft', 'active', 'archived'])
  @IsOptional()
  status?: QuestionStatus;

  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(48)
  @IsOptional()
  tag?: string;
}

export class SetQuestionStatusDto {
  @IsEnum(['draft', 'active', 'archived'])
  status!: QuestionStatus;

  @Transform(trimmed)
  @IsString()
  @Length(4, 240)
  reason!: string;
}
