import type { OtpRequestResponse, SessionSummary } from '@bsbe/contracts';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from './access-control';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';
import { CsrfService } from './csrf.service';
import { RequestOtpDto, VerifyOtpDto } from './identity.dto';
import type { AuthenticatedRequest } from './request-context';
import { SessionService } from './session.service';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly csrf: CsrfService,
  ) {}

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'Issue a signed CSRF token' })
  @ApiOkResponse({ description: 'CSRF token and matching browser cookie' })
  csrfToken(@Res({ passthrough: true }) response: Response): { csrfToken: string } {
    return { csrfToken: this.csrf.issue(response) };
  }

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request an email login code with an enumeration-safe response' })
  @ApiAcceptedResponse({ description: 'Generic response for eligible and ineligible accounts' })
  requestOtp(@Body() body: RequestOtpDto, @Req() request: Request): Promise<OtpRequestResponse> {
    return this.auth.requestLoginOtp(body.email, request);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a login code and create a rotated server session' })
  @ApiOkResponse({ description: 'Authenticated session summary' })
  @ApiUnauthorizedResponse({ description: 'Generic invalid or expired verification code' })
  async verifyOtp(
    @Body() body: VerifyOtpDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionSummary> {
    const created = await this.auth.verifyLoginOtp(body.challengeId, body.otp, request);
    response.cookie(this.sessions.cookieName(), created.token, this.sessions.cookieOptions());
    this.csrf.issue(response);
    return this.auth.sessionSummary(created.user, created.session);
  }

  @Get('session')
  @ApiCookieAuth('bsbe_session')
  @ApiOperation({ summary: 'Read the current authenticated session' })
  session(@Req() request: AuthenticatedRequest): Promise<SessionSummary> {
    const authentication = request.authentication!;
    return this.auth.sessionSummary(authentication.user, authentication.session);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('bsbe_session')
  @ApiOperation({ summary: 'Revoke the current device session' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.revokeCurrent(request.authentication!.session);
    await this.audit.record({
      eventType: 'session.revoked',
      actorUserId: request.authentication!.user._id,
      actorRole: request.authentication!.user.role,
      targetType: 'session',
      targetPublicId: request.authentication!.session.publicId,
      outcome: 'success',
      reason: 'User logout',
      request,
    });
    response.clearCookie(this.sessions.cookieName(), this.sessions.cookieOptions());
  }

  @Post('step-up/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiCookieAuth('bsbe_session')
  @ApiOperation({ summary: 'Request a fresh OTP for sensitive administrator actions' })
  requestStepUp(@Req() request: AuthenticatedRequest): Promise<OtpRequestResponse> {
    return this.auth.requestStepUpOtp(request.authentication!.user, request);
  }

  @Post('step-up/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('bsbe_session')
  @ApiOperation({ summary: 'Verify a fresh OTP for the current session' })
  async verifyStepUp(
    @Body() body: VerifyOtpDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const authentication = request.authentication!;
    await this.auth.verifyStepUpOtp(
      body.challengeId,
      body.otp,
      authentication.session,
      authentication.user,
      request,
    );
  }
}
