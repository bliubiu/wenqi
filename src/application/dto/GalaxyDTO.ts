export interface PositionDTO {
  x: number;
  y: number;
  z: number;
}

export interface NodeDTO {
  id: string;
  refType: 'POET' | 'WORK';
  refId: string;
  position: PositionDTO;
  dynasty: string;
  size: number;
  brightness: number;
  label: string;
  /** 全文检索命中时的展示信息 */
  matchedTitle?: string;
  snippet?: string;
}

export interface PoetDTO {
  id: string;
  name: string;
  dynasty: string;
  biography: string;
  workCount: number;
  courtesyName?: string | null;
  pseudonym?: string | null;
  school?: string | null;
}

export interface PoetDetailDTO {
  poet: PoetDTO;
  score: ScoreDTO | null;
  node: NodeDTO;
}

export interface ScoreDTO {
  poetId: string;
  poetName: string;
  dynasty: string;
  talent: number;
  popularity: number;
  luck: number;
}

export interface ThreeQiDTO {
  talent: number;
  popularity: number;
  luck: number;
  algorithmVersion?: string;
}

export interface RelationDTO {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  weight: number;
}

export interface QiClusterDTO {
  id: string;
  dimension: 'DYNASTY' | 'GENRE';
  key: string;
  label: string;
  center: PositionDTO;
  density: number;
  color: string;
  nodeCount: number;
}

export interface MovementDTO {
  nodeId: string;
  from: PositionDTO;
  to: PositionDTO;
  durationMs: number;
  easing: 'ease-out' | 'ease-in-out';
}

export interface WorkDTO {
  id: string;
  title: string;
  genre: string;
  poetId: string;
  poetName: string;
  threeQi: ThreeQiDTO | null;
}

export interface WorkDetailDTO extends WorkDTO {
  text: string;
  annotation: string | null;
  translation: string | null;
}

export interface SearchResultItemDTO {
  nodeId: string;
  refType: string;
  refId: string;
  title: string;
  subtitle: string;
  highlight: string;
  score: number;
}

export interface GalaxyDTO {
  nodes: NodeDTO[];
  relations: RelationDTO[];
  clusters: QiClusterDTO[];
  dataVersion: string;
}
