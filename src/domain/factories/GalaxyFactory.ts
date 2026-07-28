import { PoetAggregate } from '../aggregates/PoetAggregate';
import { Galaxy } from '../aggregates/Galaxy';
import { NodeFactory } from './NodeFactory';

export class GalaxyFactory {
  static createFromPoets(poets: PoetAggregate[]): Galaxy {
    const nodes = poets.map((aggregate) => NodeFactory.createFromPoet(aggregate.poet));
    return new Galaxy(nodes);
  }
}
