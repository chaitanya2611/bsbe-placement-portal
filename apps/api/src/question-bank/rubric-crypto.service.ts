import type { ApiEnvironment } from '@bsbe/config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Types } from 'mongoose';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedRubric {
  keyVersion: string;
  algorithm: 'aes-256-gcm';
  iv: string;
  ciphertext: string;
  authTag: string;
}

@Injectable()
export class RubricCryptoService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  encrypt(questionVersionId: Types.ObjectId, answer: unknown): EncryptedRubric {
    const keyVersion = this.config.get('QUESTION_RUBRIC_ACTIVE_KEY_VERSION', { infer: true });
    const key = this.key(keyVersion);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`question-rubric:${questionVersionId.toHexString()}`, 'utf8'));
    const plaintext = Buffer.from(JSON.stringify(answer), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      keyVersion,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(questionVersionId: Types.ObjectId, encrypted: EncryptedRubric): unknown {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(encrypted.keyVersion),
      Buffer.from(encrypted.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(`question-rubric:${questionVersionId.toHexString()}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as unknown;
  }

  private key(version: string): Buffer {
    const encoded = this.config.get('QUESTION_RUBRIC_KEYS_JSON', { infer: true })[version];
    if (!encoded) throw new Error(`Rubric key version is unavailable: ${version}`);
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error(`Rubric key ${version} is not 256 bits`);
    return key;
  }
}
