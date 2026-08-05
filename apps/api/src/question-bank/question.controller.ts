import type {
  QuestionDefinition,
  QuestionSummary,
  SafeQuestionVersion,
  UpdateQuestionInput,
} from '@bsbe/contracts';
import { questionDefinitionSchema, updateQuestionSchema } from '@bsbe/contracts';
import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions, RequireRecentAuthentication } from '../identity/access-control';
import type { AuthenticatedRequest } from '../identity/request-context';
import { ListQuestionsDto, SetQuestionStatusDto } from './question.dto';
import { QuestionService, type QuestionHistory, type RevealedRubric } from './question.service';
import { ZodValidationPipe } from './zod-validation.pipe';

@ApiTags('question bank')
@ApiCookieAuth('bsbe_session')
@Controller('admin/questions')
@RequirePermissions('question:manage')
export class QuestionController {
  constructor(private readonly questions: QuestionService) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter the versioned question bank' })
  list(@Query() query: ListQuestionsDto): Promise<QuestionSummary[]> {
    return this.questions.list(query);
  }

  @Post()
  @RequireRecentAuthentication()
  @ApiBody({ description: 'Validated question definition including the encrypted-at-rest answer' })
  @ApiOperation({ summary: 'Create a draft question and immutable version 1' })
  create(
    @Body(new ZodValidationPipe(questionDefinitionSchema)) definition: QuestionDefinition,
    @Req() request: AuthenticatedRequest,
  ): Promise<SafeQuestionVersion> {
    return this.questions.create(definition, request.authentication!.user, request);
  }

  @Get(':questionId')
  @ApiOperation({ summary: 'Preview the current safe question version without its answer' })
  current(@Param('questionId') questionId: string): Promise<SafeQuestionVersion> {
    return this.questions.current(questionId);
  }

  @Put(':questionId')
  @RequireRecentAuthentication()
  @ApiBody({
    description: 'Expected current version plus a complete validated replacement definition',
  })
  @ApiOperation({ summary: 'Create a new immutable question version using optimistic concurrency' })
  update(
    @Param('questionId') questionId: string,
    @Body(new ZodValidationPipe(updateQuestionSchema)) input: UpdateQuestionInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<SafeQuestionVersion> {
    return this.questions.update(questionId, input, request.authentication!.user, request);
  }

  @Post(':questionId/clone')
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Clone the current version into a separate draft question' })
  clone(
    @Param('questionId') questionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<SafeQuestionVersion> {
    return this.questions.clone(questionId, request.authentication!.user, request);
  }

  @Patch(':questionId/status')
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Activate, return to draft, or archive a question with a reason' })
  setStatus(
    @Param('questionId') questionId: string,
    @Body() body: SetQuestionStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<QuestionSummary> {
    return this.questions.setStatus(
      questionId,
      body.status,
      body.reason,
      request.authentication!.user,
      request,
    );
  }

  @Get(':questionId/history')
  @ApiOperation({ summary: 'Read immutable version and future exam-usage history' })
  history(@Param('questionId') questionId: string): Promise<QuestionHistory> {
    return this.questions.history(questionId);
  }

  @Get(':questionId/rubric')
  @RequirePermissions('question:rubric-read')
  @RequireRecentAuthentication()
  @ApiOperation({ summary: 'Decrypt the current answer for an authorized administrator review' })
  revealRubric(
    @Param('questionId') questionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RevealedRubric> {
    return this.questions.revealRubric(questionId, request.authentication!.user, request);
  }
}
