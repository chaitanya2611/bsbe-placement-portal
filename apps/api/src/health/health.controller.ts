import { Controller, Get, Req, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { correlationIdHeader } from '../common/correlation-id.middleware';
import { Public } from '../identity/access-control';
import { HealthResponseDto } from './health.response.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness check' })
  @ApiOkResponse({ type: HealthResponseDto })
  liveness(@Req() request: Request): HealthResponseDto {
    return this.healthService.liveness(this.correlationId(request));
  }

  @Get('ready')
  @ApiOperation({ summary: 'Dependency readiness check' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ type: HealthResponseDto })
  readiness(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): HealthResponseDto {
    const report = this.healthService.readiness(this.correlationId(request));
    response.status(report.status === 'ok' ? 200 : 503);
    return report;
  }

  private correlationId(request: Request): string {
    return String(request.headers[correlationIdHeader] ?? 'unavailable');
  }
}
