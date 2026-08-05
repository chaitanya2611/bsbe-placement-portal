import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isEmail } from 'class-validator';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AuditService } from './audit.service';
import {
  IDENTITY_MODELS,
  type SessionRecord,
  type UserDocument,
  type UserRecord,
} from './identity.models';
import { canonicalizeEmail } from './security.util';

@Injectable()
export class BootstrapAdminService {
  constructor(
    @InjectModel(IDENTITY_MODELS.user) private readonly userModel: Model<UserRecord>,
    @InjectModel(IDENTITY_MODELS.session) private readonly sessionModel: Model<SessionRecord>,
    private readonly audit: AuditService,
  ) {}

  async bootstrap(emailInput: string, fullNameInput: string): Promise<UserDocument> {
    const email = canonicalizeEmail(emailInput);
    const fullName = fullNameInput.trim();
    if (!fullName || fullName.length > 160)
      throw new Error('Administrator name must be 1-160 characters');
    if (!isEmail(email) || email.length > 254)
      throw new Error('Administrator email must be a valid email address');
    if (await this.userModel.exists({ role: 'admin' })) {
      throw new ConflictException('Bootstrap refused because an administrator already exists');
    }
    try {
      const user = await this.userModel.create({
        publicId: randomUUID(),
        email,
        fullName,
        role: 'admin',
        status: 'active',
        securityRevision: 1,
      });
      await this.audit.record({
        eventType: 'account.bootstrap-admin-created',
        actorRole: 'system',
        targetType: 'user',
        targetPublicId: user.publicId,
        outcome: 'success',
      });
      return user;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new ConflictException('Bootstrap refused because the account already exists');
      }
      throw error;
    }
  }

  async changeEmail(currentEmailInput: string, newEmailInput: string): Promise<UserDocument> {
    const currentEmail = canonicalizeEmail(currentEmailInput);
    const newEmail = canonicalizeEmail(newEmailInput);
    this.assertValidEmail(currentEmail);
    this.assertValidEmail(newEmail);

    const databaseSession = await this.userModel.db.startSession();
    try {
      let updatedAdmin: UserDocument | null = null;
      await databaseSession.withTransaction(async () => {
        const currentAdmin = await this.userModel
          .findOne({ email: currentEmail, role: 'admin' })
          .session(databaseSession)
          .exec();
        if (!currentAdmin) {
          throw new NotFoundException('Administrator account not found for the current email');
        }
        if (currentEmail === newEmail) {
          updatedAdmin = currentAdmin;
          return;
        }

        updatedAdmin = await this.userModel.findOneAndUpdate(
          { _id: currentAdmin._id, email: currentEmail, role: 'admin' },
          { $set: { email: newEmail }, $inc: { securityRevision: 1 } },
          { new: true, runValidators: true, session: databaseSession },
        );
        if (!updatedAdmin) {
          throw new ConflictException(
            'Administrator email changed concurrently; retry the operation',
          );
        }

        const now = new Date();
        await this.sessionModel.updateMany(
          { userId: currentAdmin._id, active: true },
          {
            $set: {
              active: false,
              revokedAt: now,
              revocationReason: 'Administrator email changed',
            },
          },
          { session: databaseSession },
        );
        await this.audit.record({
          eventType: 'account.admin-email-changed',
          actorRole: 'system',
          targetType: 'user',
          targetPublicId: currentAdmin.publicId,
          outcome: 'success',
          metadata: { previousEmail: currentEmail, newEmail },
          databaseSession,
        });
      });
      if (!updatedAdmin) {
        throw new Error('Administrator email update did not complete');
      }
      return updatedAdmin;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new ConflictException('The new administrator email is already in use');
      }
      throw error;
    } finally {
      await databaseSession.endSession();
    }
  }

  private assertValidEmail(email: string): void {
    if (!isEmail(email) || email.length > 254)
      throw new Error('Administrator email must be a valid email address');
  }
}
