import { ApiProperty } from '@nestjs/swagger';

export class DependencyCheckDto {
  @ApiProperty({ enum: ['ok', 'degraded', 'down'] })
  status!: 'ok' | 'degraded' | 'down';

  @ApiProperty({ required: false })
  detail?: string;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded', 'down'] })
  status!: 'ok' | 'degraded' | 'down';

  @ApiProperty({ format: 'date-time' })
  checkedAt!: string;

  @ApiProperty({ example: 'bsbe-api' })
  service!: string;

  @ApiProperty({ example: '0.3.0' })
  version!: string;

  @ApiProperty()
  correlationId!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'object' } })
  checks!: Record<string, DependencyCheckDto>;
}
