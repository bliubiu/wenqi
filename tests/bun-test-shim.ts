import {
  describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi,
} from 'vitest';
import type { MockedFunction } from 'vitest';

const spyOn = vi.spyOn.bind(vi);
type Mock<T> = MockedFunction<T>;

export {
  describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, spyOn,
};
export type { Mock };
