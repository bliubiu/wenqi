export class NodeId {
  constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('NodeId 不能为空');
    }
  }

  equals(other: NodeId): boolean {
    return this.value === other.value;
  }
}

export class PoetId {
  constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('PoetId 不能为空');
    }
  }

  equals(other: PoetId): boolean {
    return this.value === other.value;
  }
}

export class WorkId {
  constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('WorkId 不能为空');
    }
  }

  equals(other: WorkId): boolean {
    return this.value === other.value;
  }
}

export class RelationId {
  constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('RelationId 不能为空');
    }
  }

  equals(other: RelationId): boolean {
    return this.value === other.value;
  }
}

export class ClusterId {
  constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('ClusterId 不能为空');
    }
  }

  equals(other: ClusterId): boolean {
    return this.value === other.value;
  }
}
