import { Relation } from '@/domain/entities/Relation';
import { RelationRepository } from '@/domain/ports/DataPorts';
import { RelationService } from '@/domain/services/RelationService';

/**
 * 获取诗人关系用例：领域服务入口经持久化分片仓储查询，
 * 分片不可用时由仓储内部回退运行时即时生成。
 */
export class GetPoetRelationsUseCase {
  constructor(
    private relationService: RelationService,
    private relationRepo: RelationRepository
  ) {}

  async execute(nodeId: string): Promise<Relation[]> {
    return this.relationService.findRelated(nodeId, this.relationRepo);
  }
}
