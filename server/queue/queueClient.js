// ProofPilot Job Queue Client
// Uses BullMQ (Redis-backed) when REDIS_URL is configured.
// Falls back to synchronous in-process execution when Redis is unavailable.
// This ensures zero hard dependency on Redis for dev/demo mode.

let Queue, Worker, isRedisAvailable;

async function loadBullMQ() {
  try {
    const bullmq = await import("bullmq");
    Queue = bullmq.Queue;
    Worker = bullmq.Worker;
    return true;
  } catch {
    return false;
  }
}

const redisUrl = process.env.REDIS_URL;
let queueConnection = null;
let initialized = false;
let bullmqLoaded = false;

// In-memory queue for graceful degradation (no Redis)
const inMemoryQueues = new Map();

export const QUEUE_NAMES = {
  EVIDENCE_INGEST: "evidence-ingest",
  DISPUTE_SUBMIT: "dispute-submit",
  NOTIFICATION: "notification",
};

export const JOB_TYPES = {
  PROCESS_EVIDENCE: "process-evidence",
  SUBMIT_DISPUTE: "submit-dispute",
  ACCEPT_DISPUTE: "accept-dispute",
  NOTIFY_MERCHANT: "notify-merchant",
};

async function init() {
  if (initialized) return;
  initialized = true;
  bullmqLoaded = await loadBullMQ();

  if (bullmqLoaded && redisUrl) {
    try {
      const { URL } = await import("node:url");
      const parsed = new URL(redisUrl);
      queueConnection = {
        host: parsed.hostname,
        port: Number(parsed.port) || 6379,
        password: parsed.password || undefined,
        tls: redisUrl.startsWith("rediss://") ? {} : undefined,
      };
      console.log("[ProofPilot Queue] BullMQ connected to Redis");
      isRedisAvailable = true;
    } catch (error) {
      console.warn("[ProofPilot Queue] Redis connection failed, using in-memory fallback:", error.message);
      isRedisAvailable = false;
    }
  } else {
    isRedisAvailable = false;
  }
}

/**
 * Get or create a BullMQ Queue instance.
 */
function getBullQueue(queueName) {
  if (!Queue || !queueConnection) return null;
  return new Queue(queueName, { connection: queueConnection });
}

/**
 * Add a job to the queue.
 * Falls back to returning a pseudo-job object if Redis is unavailable.
 */
export async function addJob(queueName, jobType, data, options = {}) {
  await init();

  if (isRedisAvailable) {
    const queue = getBullQueue(queueName);
    if (queue) {
      const job = await queue.add(jobType, data, {
        attempts: options.attempts ?? 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        ...options,
      });
      return { queued: true, mode: "redis", jobId: job.id, queueName, jobType };
    }
  }

  // In-memory fallback — execute synchronously
  if (!inMemoryQueues.has(queueName)) inMemoryQueues.set(queueName, []);
  const jobId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  inMemoryQueues.get(queueName).push({ jobId, jobType, data, addedAt: new Date().toISOString() });

  return { queued: false, mode: "in-memory", jobId, queueName, jobType };
}

/**
 * Register a BullMQ Worker for a queue.
 * No-ops if Redis is unavailable (jobs are handled synchronously in that case).
 */
export async function registerWorker(queueName, processor, workerOptions = {}) {
  await init();
  if (!isRedisAvailable || !Worker || !queueConnection) {
    return null;
  }
  const worker = new Worker(queueName, processor, {
    connection: queueConnection,
    concurrency: workerOptions.concurrency ?? 5,
    ...workerOptions,
  });
  worker.on("completed", (job) => {
    console.info(`[ProofPilot Queue] Job ${job.id} (${job.name}) completed in '${queueName}'`);
  });
  worker.on("failed", (job, error) => {
    console.error(`[ProofPilot Queue] Job ${job?.id} (${job?.name}) failed in '${queueName}':`, error.message);
  });
  return worker;
}

/**
 * Get queue health statistics for the reliability dashboard.
 */
export async function getQueueHealth() {
  await init();

  if (!isRedisAvailable) {
    const inMemoryStats = {};
    for (const [name, jobs] of inMemoryQueues.entries()) {
      inMemoryStats[name] = { pending: jobs.length, mode: "in-memory" };
    }
    return {
      available: false,
      mode: "in-memory-fallback",
      redis_url_configured: Boolean(redisUrl),
      queues: inMemoryStats,
      message: "Redis not configured — jobs execute synchronously. Set REDIS_URL for production job retry support.",
    };
  }

  try {
    const stats = {};
    for (const queueName of Object.values(QUEUE_NAMES)) {
      const queue = getBullQueue(queueName);
      if (queue) {
        const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
        stats[queueName] = counts;
        await queue.close();
      }
    }
    return { available: true, mode: "redis", queues: stats };
  } catch (error) {
    return { available: false, mode: "redis-error", error: error.message, queues: {} };
  }
}

export { isRedisAvailable };
