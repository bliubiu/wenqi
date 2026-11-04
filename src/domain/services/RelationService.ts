import { GalaxyNode } from '../entities/Node';
import { Relation, type RelationType } from '../entities/Relation';
import { PoetAggregate } from '../aggregates/PoetAggregate';
import { type RelationRepository } from '../ports/DataPorts';

interface RelationRule {
  type: RelationType;
  weight: number;
  match: (a: { dynasty: string; poetId: string }, b: { dynasty: string; poetId: string }) => boolean;
}

const RELATION_RULES: RelationRule[] = [
  { type: 'SAME_DYNASTY' as RelationType, weight: 0.3, match: (a, b) => a.dynasty === b.dynasty && a.poetId !== b.poetId },
];

export class RelationService {
  async findRelated(
    nodeId: string,
    relationRepo: RelationRepository
  ): Promise<Relation[]> {
    return relationRepo.findByNodeId(nodeId);
  }

  computeWeight(
    source: GalaxyNode,
    target: GalaxyNode,
    relationType: RelationType
  ): number {
    switch (relationType) {
      case 'SAME_DYNASTY': {
        let weight = 0.3;
        if (source.genre && target.genre && source.genre === target.genre) {
          weight += 0.2;
        }
        return Math.min(weight, 1);
      }
      case 'CITATION':
        return 0.5;
      case 'INFLUENCE':
        return 0.6;
      case 'TEACHER_STUDENT':
        return 0.7;
      case 'FRIEND':
        return 0.6;
      case 'SAME_SCHOOL':
        return 0.4;
      case 'ANTHOLOGY':
        return 0.3;
      default:
        return 0.1;
    }
  }

  generateFromNodes(nodes: GalaxyNode[]): Relation[] {
    const relations: Relation[] = [];
    let relationId = 0;

    const nodeMetadata = new Map<string, { dynasty: string; poetId: string }>();
    for (const node of nodes) {
      nodeMetadata.set(node.id, { dynasty: node.dynasty, poetId: node.refId });
    }

    const alreadySeen = new Set<string>();
    const pairKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

    for (let i = 0; i < nodes.length && relations.length < 50000; i++) {
      const aId = nodes[i].id;
      const aMeta = nodeMetadata.get(aId);
      if (!aMeta) continue;

      const maxJ = Math.min(i + 50, nodes.length);
      for (let j = i + 1; j < maxJ; j++) {
        const bId = nodes[j].id;
        const bMeta = nodeMetadata.get(bId);
        if (!bMeta) continue;

        const key = pairKey(aId, bId);
        if (alreadySeen.has(key)) continue;
        alreadySeen.add(key);

        for (const rule of RELATION_RULES) {
          if (rule.match(aMeta, bMeta)) {
            relations.push(new Relation(
              `rel_${relationId++}`,
              aId, bId, rule.type, rule.weight
            ));
            break;
          }
        }
      }
    }

    return relations;
  }

  buildAllRelations(poets: PoetAggregate[]): Relation[] {
    const relations: Relation[] = [];
    let relationId = 0;

    for (let i = 0; i < poets.length; i++) {
      for (let j = i + 1; j < poets.length; j++) {
        const a = poets[i].poet;
        const b = poets[j].poet;

        if (a.dynasty === b.dynasty) {
          const weight = a.school && b.school && a.school === b.school ? 0.5 : 0.3;
          relations.push(new Relation(
            `rel_${relationId++}`,
            a.id,
            b.id,
            'SAME_DYNASTY',
            weight
          ));
        }
      }
    }

    return relations;
  }
}
