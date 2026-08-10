import type { Queue } from "bullmq";
import type pino from "pino";

const DAILY_MS = 24 * 60 * 60 * 1000;

/**
 * Run a maintenance task once at startup, then register it on a daily
 * schedule.
 *
 * The rejection handling is the point. Each caller used to inline a floating
 * `void (async () => { ... })()` whose `.catch` covered only the immediate run
 * — a failure from `upsertJobScheduler` escaped as an unhandled rejection, and
 * the recurring schedule was then silently never registered, so the task ran
 * once at boot and never again.
 */
export function runDaily(
  queue: Queue,
  schedulerId: string,
  label: string,
  task: () => Promise<void>,
  logger: pino.Logger,
): void {
  void (async () => {
    try {
      await task();
    } catch (error) {
      logger.error({ err: error }, `startup ${label} failed`);
    }
    try {
      await queue.upsertJobScheduler(schedulerId, { every: DAILY_MS });
    } catch (error) {
      logger.error({ err: error }, `could not register the daily ${label} schedule`);
    }
  })();
}
