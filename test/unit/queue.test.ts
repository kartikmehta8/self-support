import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BullMqSupportQueue,
  type BullMqSupportQueueDependencies
} from "../../src/queue/bullmq-support-queue.js";
import { createSupportQueue } from "../../src/queue/create-support-queue.js";
import type { AnswerTicketJob, SupportQueue } from "../../src/queue/support-queue.js";
import { makeConfig, makeLogger } from "../support/helpers.js";

describe("BullMqSupportQueue", () => {
  it("enqueues jobs, starts workers, logs failures, and shuts down resources", async () => {
    const records = makeBullMqRecords();
    const logger = {
      ...makeLogger(),
      error: (entry: unknown, message = "") => {
        records.errors.push({ entry, message });
      }
    } as never;
    const queue = new BullMqSupportQueue("redis://test", 4, logger, records.dependencies);

    await queue.enqueueAnswer({ ticketId: "SELF-1", attemptReason: "admin-refresh" });
    await queue.start(async (job) => {
      records.handled.push(job.ticketId);
    });
    await records.workerHandler?.({ ticketId: "SELF-2" });
    records.failedHandler?.({ id: "job-1", data: { ticketId: "SELF-3" } }, new Error("boom"));
    records.failedHandler?.(undefined, new Error("missing job"));
    await queue.stop();

    assert.equal(records.redisUrl, "redis://test");
    assert.equal(records.workerConcurrency, 4);
    assert.deepEqual(records.handled, ["SELF-2"]);
    assert.equal(records.added[0]?.name, "answer-ticket");
    assert.deepEqual(records.added[0]?.job, {
      ticketId: "SELF-1",
      attemptReason: "admin-refresh"
    });
    assert.deepEqual(records.closed, ["worker", "queue", "connection"]);
    assert.equal(records.errors.length, 2);
    assert.match(records.errors[0]?.message ?? "", /BullMQ answer job failed/);
  });
});

describe("createSupportQueue", () => {
  it("uses the configured queue factory", () => {
    const memoryQueue = {} as SupportQueue;
    const redisQueue = {} as SupportQueue;
    const factories = {
      createRedisQueue: () => redisQueue,
      createMemoryQueue: () => memoryQueue
    };

    assert.equal(
      createSupportQueue(makeConfig({ queue: { backend: "redis" } }), makeLogger(), factories),
      redisQueue
    );
    assert.equal(createSupportQueue(makeConfig(), makeLogger(), factories), memoryQueue);
  });
});

function makeBullMqRecords() {
  const records = {
    redisUrl: "",
    workerConcurrency: 0,
    added: [] as Array<{ name: string; job: AnswerTicketJob; options: unknown }>,
    closed: [] as string[],
    handled: [] as string[],
    errors: [] as Array<{ entry: unknown; message: string }>,
    workerHandler: undefined as ((job: AnswerTicketJob) => Promise<void>) | undefined,
    failedHandler: undefined as
      | ((job: { id?: string; data: AnswerTicketJob } | undefined, error: Error) => void)
      | undefined,
    dependencies: undefined as BullMqSupportQueueDependencies | undefined
  };

  records.dependencies = {
    createConnection: (redisUrl) => {
      records.redisUrl = redisUrl;
      return { quit: async () => records.closed.push("connection") };
    },
    createQueue: () => ({
      add: async (name, job, options) => records.added.push({ name, job, options }),
      close: async () => records.closed.push("queue")
    }),
    createWorker: (_connection, concurrency, handler) => {
      records.workerConcurrency = concurrency;
      records.workerHandler = handler;
      return {
        on: (_event, failedHandler) => {
          records.failedHandler = failedHandler;
        },
        close: async () => records.closed.push("worker")
      };
    }
  };

  return records as typeof records & { dependencies: BullMqSupportQueueDependencies };
}
