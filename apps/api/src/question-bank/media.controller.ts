import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { MediaAsset } from '@bsbe/contracts';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { RequirePermissions, RequireRecentAuthentication } from '../identity/access-control';
import { ListQueryDto } from '../identity/identity.dto';
import type { AuthenticatedRequest } from '../identity/request-context';
import { MediaService } from './media.service';

@ApiTags('question media')
@ApiCookieAuth('bsbe_session')
@Controller('admin/media')
@RequirePermissions('media:manage')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RequireRecentAuthentication()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Decode, normalize, and store a safe question image' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: 10_485_760, fields: 0 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<MediaAsset> {
    return this.media.upload(file, request.authentication!.user, request);
  }

  @Get()
  @ApiOperation({ summary: 'List ready question media' })
  list(@Query() query: ListQueryDto): Promise<MediaAsset[]> {
    return this.media.list(query.limit);
  }

  @Get(':mediaId/content')
  @ApiOperation({ summary: 'Read normalized media for administrator preview' })
  async content(@Param('mediaId') mediaId: string, @Res() response: Response): Promise<void> {
    const content = await this.media.content(mediaId);
    response.set({
      'Content-Type': content.asset.contentType,
      'Content-Length': String(content.body.length),
      'Content-Disposition': `inline; filename="media-${content.asset.publicId}.webp"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.status(HttpStatus.OK).send(content.body);
  }

  @Delete(':mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Delete unreferenced question media' })
  async remove(
    @Param('mediaId') mediaId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.media.remove(mediaId, request.authentication!.user, request);
  }
}
