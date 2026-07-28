import { describe, it, expect } from 'bun:test';
import {
  DomainError,
  InvalidScoreError,
  IncompatibleAlgorithmVersionError,
  NodeNotFoundError,
  InvalidRelationError,
  ConvergenceLimitExceededError,
} from '../DomainError';

describe('DomainError', () => {
  it('InvalidScoreError 应包含正确 code', () => {
    const err = new InvalidScoreError();
    expect(err.code).toBe('DOMAIN_INVALID_SCORE');
    expect(err.userMessage).toBeTruthy();
    expect(err.message).toContain('评分');
  });

  it('IncompatibleAlgorithmVersionError 应包含版本信息', () => {
    const err = new IncompatibleAlgorithmVersionError('v1.0', 'v2.0');
    expect(err.code).toBe('DOMAIN_INCOMPATIBLE_VERSION');
    expect(err.message).toContain('v1.0');
    expect(err.message).toContain('v2.0');
  });

  it('NodeNotFoundError 应包含节点 ID', () => {
    const err = new NodeNotFoundError('poet_1');
    expect(err.code).toBe('DOMAIN_NODE_NOT_FOUND');
    expect(err.message).toContain('poet_1');
  });

  it('InvalidRelationError 应包含关联错误信息', () => {
    const err = new InvalidRelationError('自环');
    expect(err.code).toBe('DOMAIN_INVALID_RELATION');
    expect(err.message).toContain('自环');
  });

  it('ConvergenceLimitExceededError 应包含上限值', () => {
    const err = new ConvergenceLimitExceededError(50);
    expect(err.code).toBe('DOMAIN_CONVERGENCE_LIMIT');
    expect(err.message).toContain('50');
  });

  it('所有错误应继承自 DomainError', () => {
    expect(new InvalidScoreError()).toBeInstanceOf(DomainError);
    expect(new NodeNotFoundError('x')).toBeInstanceOf(DomainError);
    expect(new ConvergenceLimitExceededError(50)).toBeInstanceOf(DomainError);
  });
});
