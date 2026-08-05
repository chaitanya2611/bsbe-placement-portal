import type { SeedContext, SeedRunResult, SeedTask } from './seed.types';

export class SeedRunner {
  constructor(private readonly tasks: readonly SeedTask[]) {
    const taskIds = new Set(tasks.map((task) => task.id));
    if (taskIds.size !== tasks.length) {
      throw new Error('Seed task IDs must be unique');
    }
  }

  async run(context: SeedContext): Promise<SeedRunResult> {
    const executedTaskIds: string[] = [];
    for (const task of this.tasks) {
      context.log(`${context.dryRun ? '[dry-run] ' : ''}${task.id}: ${task.description}`);
      if (!context.dryRun) {
        await task.run(context);
      }
      executedTaskIds.push(task.id);
    }
    return { dryRun: context.dryRun, executedTaskIds };
  }
}
