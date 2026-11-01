import { describe, it, expect } from 'bun:test';
import { dynastyToTable, shardBucket, workShardRelPath, WORKS_FALLBACK_TABLE, WORKS_TABLE_NAMES } from '../shard';

describe('dynastyToTable（朝代 → SQLite 分表名）', () => {
  it('十个标准朝代应映射到对应分表', () => {
    expect(dynastyToTable('PRE_QIN')).toBe('works_pre_qin');
    expect(dynastyToTable('HAN')).toBe('works_han');
    expect(dynastyToTable('WEI_JIN')).toBe('works_wei_jin');
    expect(dynastyToTable('TANG')).toBe('works_tang');
    expect(dynastyToTable('FIVE_DYNASTIES')).toBe('works_five_dynasties');
    expect(dynastyToTable('SONG')).toBe('works_song');
    expect(dynastyToTable('YUAN')).toBe('works_yuan');
    expect(dynastyToTable('MING')).toBe('works_ming');
    expect(dynastyToTable('QING')).toBe('works_qing');
    expect(dynastyToTable('MODERN')).toBe('works_modern');
  });

  it('未知朝代应归入兜底分表', () => {
    expect(dynastyToTable('UNKNOWN')).toBe(WORKS_FALLBACK_TABLE);
    expect(dynastyToTable('')).toBe(WORKS_FALLBACK_TABLE);
  });

  it('分表清单应包含全部朝代分表与兜底表', () => {
    expect(WORKS_TABLE_NAMES).toHaveLength(11);
    expect(new Set(WORKS_TABLE_NAMES).size).toBe(11);
  });
});

describe('shardBucket（诗人分片桶）', () => {
  it('标准 poetId 应取 UUID 前两位十六进制', () => {
    expect(shardBucket('poet_f78aa699-e012-4059-9e29-5d30e16cc1d8')).toBe('f7');
    expect(shardBucket('poet_1701410c-07da-42a3-b2fb-7b1e407d7d52')).toBe('17');
  });

  it('格式异常的 poetId 应哈希兜底且结果确定', () => {
    const first = shardBucket('poet_异常格式');
    const second = shardBucket('poet_异常格式');
    expect(first).toMatch(/^[0-9a-f]{2}$/);
    expect(second).toBe(first);
  });
});

describe('workShardRelPath（分片相对路径）', () => {
  it('应生成 桶目录/诗人ID.json 形式的路径', () => {
    expect(workShardRelPath('poet_f78aa699-e012-4059-9e29-5d30e16cc1d8')).toBe(
      'works/poet/f7/poet_f78aa699-e012-4059-9e29-5d30e16cc1d8.json'
    );
  });
});
