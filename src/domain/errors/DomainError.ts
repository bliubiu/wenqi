export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly userMessage: string;

  constructor(message?: string) {
    super(message ?? '领域错误');
    this.name = this.constructor.name;
  }
}

export class InvalidScoreError extends DomainError {
  readonly code = 'DOMAIN_INVALID_SCORE';
  readonly userMessage = '评分数据无效，请检查数据源';

  constructor(detail?: string) {
    super(detail ? `评分数据无效: ${detail}` : '评分数据无效，请检查数据源');
  }
}

export class IncompatibleAlgorithmVersionError extends DomainError {
  readonly code = 'DOMAIN_INCOMPATIBLE_VERSION';
  readonly userMessage = '评分算法版本不兼容，需重新计算';

  constructor(fromVersion: string, toVersion: string) {
    super(`评分算法版本不兼容: ${fromVersion} → ${toVersion}`);
  }
}

export class NodeNotFoundError extends DomainError {
  readonly code = 'DOMAIN_NODE_NOT_FOUND';
  readonly userMessage = '未找到指定节点';

  constructor(nodeId: string) {
    super(`未找到指定节点: ${nodeId}`);
  }
}

export class InvalidRelationError extends DomainError {
  readonly code = 'DOMAIN_INVALID_RELATION';
  readonly userMessage = '关联数据无效';

  constructor(detail?: string) {
    super(detail ? `关联数据无效: ${detail}` : '关联数据无效');
  }
}

export class ConvergenceLimitExceededError extends DomainError {
  readonly code = 'DOMAIN_CONVERGENCE_LIMIT';
  readonly userMessage = '聚气节点数超限';

  constructor(limit: number) {
    super(`聚气节点数超限（上限 ${limit} 个）`);
  }
}
