import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from '../identity/access-control';

class PlatformMetadataDto {
  @ApiProperty({ example: 'bsbe-api' })
  service!: string;

  @ApiProperty({ example: '0.3.0' })
  version!: string;

  @ApiProperty({ example: 'phase-2-identity-access' })
  phase!: string;
}

@ApiTags('platform')
@Public()
@Controller()
export class PlatformController {
  @Get()
  @ApiOperation({ summary: 'API metadata' })
  @ApiOkResponse({ type: PlatformMetadataDto })
  metadata(): PlatformMetadataDto {
    return {
      service: 'bsbe-api',
      version: '0.3.0',
      phase: 'phase-2-identity-access',
    };
  }
}
