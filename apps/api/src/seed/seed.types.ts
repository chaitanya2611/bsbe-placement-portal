export interface SeedContext {
  dryRun: boolean;
  log(message: string): void;
}

export interface SeedTask {
  id: string;
  description: string;
  run(context: SeedContext): Promise<void>;
}

export interface SeedRunResult {
  dryRun: boolean;
  executedTaskIds: string[];
}
