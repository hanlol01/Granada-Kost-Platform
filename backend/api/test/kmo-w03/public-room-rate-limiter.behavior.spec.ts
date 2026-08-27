import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicRoomRateLimiterService } from '../../src/modules/room/public-room-rate-limiter.service';

function createRedisClient(overrides: Record<string, unknown> = {}) {
  return {
    status: 'wait',
    connect: async () => {
      throw new Error('Redis unavailable');
    },
    incr: async () => {
      throw new Error('Redis unavailable');
    },
    expire: async () => 1,
    ...overrides,
  };
}

function restoreEnvironment(previousEnvironment: string | undefined): void {
  if (previousEnvironment === undefined) {
    delete process.env.NODE_ENV;
    return;
  }

  process.env.NODE_ENV = previousEnvironment;
}

test('public catalog remains available in development while Redis is unavailable', async () => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    let connectAttempts = 0;
    const redisClient = createRedisClient({
      connect: async () => {
        connectAttempts += 1;
        throw new Error('Redis unavailable');
      },
    });
    const limiter = new PublicRoomRateLimiterService({ client: redisClient } as never);

    await limiter.assertAllowed('127.0.0.1', 'hunian-catalog');

    assert.equal(connectAttempts, 1);
  } finally {
    restoreEnvironment(previousEnvironment);
  }
});

test('production remains fail-closed when Redis is unavailable', async () => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const limiter = new PublicRoomRateLimiterService({
      client: createRedisClient(),
    } as never);

    await assert.rejects(
      () => limiter.assertAllowed('127.0.0.1', 'hunian-catalog'),
      /Redis unavailable/,
    );
  } finally {
    restoreEnvironment(previousEnvironment);
  }
});

test('a ready Redis client still enforces the public request limit', async () => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    const limiter = new PublicRoomRateLimiterService({
      client: createRedisClient({
        status: 'ready',
        incr: async () => 121,
      }),
    } as never);

    await assert.rejects(
      () => limiter.assertAllowed('127.0.0.1', 'hunian-catalog'),
      (error: { getStatus?: () => number }) => error.getStatus?.() === 429,
    );
  } finally {
    restoreEnvironment(previousEnvironment);
  }
});
