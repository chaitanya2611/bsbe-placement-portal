import { type ApiEnvironment } from '@bsbe/config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import type { ClientSession, Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { correlationIdHeader } from '../common/correlation-id.middleware';
import {
  IDENTITY_MODELS,
  type AuditEventDocument,
  type AuditEventRecord,
  type UserRole,
} from './identity.models';
import { hmacHex } from './security.util';

export interface AuditInput {
  eventType: string;
  actorUserId?: Types.ObjectId | undefined;
  actorRole?: UserRole | 'system' | 'anonymous' | undefined;
  targetType?: string | undefined;
  targetPublicId?: string | undefined;
  outcome: 'success' | 'failure' | 'rejected';
  reason?: string | undefined;
  metadata?: Record<string, string | number | boolean> | undefined;
  request?: Request | undefined;
  databaseSession?: ClientSession | undefined;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(IDENTITY_MODELS.auditEvent)
    private readonly auditModel: Model<AuditEventRecord>,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async record(input: AuditInput): Promise<void> {
    const request = input.request;
    await this.auditModel.create(
      [
        {
          publicId: randomUUID(),
          eventType: input.eventType,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          targetType: input.targetType,
          targetPublicId: input.targetPublicId,
          outcome: input.outcome,
          reason: input.reason,
          correlationId: request ? String(request.headers[correlationIdHeader] ?? '') : undefined,
          ipHash: request ? this.hashIp(request.ip) : undefined,
          userAgent: request?.get('user-agent')?.slice(0, 300),
          metadata: input.metadata,
          occurredAt: new Date(),
        },
      ],
      input.databaseSession ? { session: input.databaseSession } : {},
    );
  }

  async list(limit: number): Promise<AuditEventDocument[]> {
    return this.auditModel.find().sort({ occurredAt: -1 }).limit(limit).lean(false).exec();
  }

  hashIp(ip: string | undefined): string {
    return hmacHex(this.config.get('IP_HASH_KEY', { infer: true }), ip ?? 'unknown');
  }
}
