import { ConsoleLogger, type LogLevel } from '@nestjs/common';

interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  trace?: string;
}

export class JsonLogger extends ConsoleLogger {
  constructor(private readonly environment: string) {
    super('bsbe-api', { timestamp: false });
  }

  override log(message: unknown, context?: string): void {
    this.writeStructured('log', message, context);
  }

  override error(message: unknown, trace?: string, context?: string): void {
    this.writeStructured('error', message, context, trace);
  }

  override warn(message: unknown, context?: string): void {
    this.writeStructured('warn', message, context);
  }

  override debug(message: unknown, context?: string): void {
    this.writeStructured('debug', message, context);
  }

  override verbose(message: unknown, context?: string): void {
    this.writeStructured('verbose', message, context);
  }

  private writeStructured(
    level: LogLevel,
    message: unknown,
    context?: string,
    trace?: string,
  ): void {
    const entry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message: this.safeMessage(message),
    };
    if (context) entry.context = context;
    if (trace && this.environment !== 'production') entry.trace = trace;

    const serialized = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(`${serialized}\n`);
    } else {
      process.stdout.write(`${serialized}\n`);
    }
  }

  private safeMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message instanceof Error) return message.message;
    return 'Structured log event';
  }
}
