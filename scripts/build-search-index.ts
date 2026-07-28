import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DATA_DIR = path.join(__dirname, '../data/processed');

interface Poet {
  id: string;
  name: string;
  dynasty: string;
  biography: string;
  workCount: number;
}

interface Work {
  id: string;
  title: string;
  poetId: string;
  poetName: string;
  dynasty: string;
  genre: string;
  text: string;
}

interface SearchDocument {
  id: string;
  refType: 'POET' | 'WORK';
  refId: string;
  title: string;
  content: string;
  dynasty: string;
  genre: string | null;
  poetName: string | null;
}

interface InvertedIndex {
  [token: string]: string[];
}

interface SearchIndexData {
  documents: SearchDocument[];
  invertedIndex: InvertedIndex;
  metadata: {
    documentCount: number;
    indexSize: number;
    buildTime: number;
  };
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];

  const cleaned = text.replace(/\s+/g, '');

  const chars = Array.from(cleaned);
  for (const ch of chars) {
    if (/[一-龥]/.test(ch)) {
      tokens.push(ch);
    }
  }
  for (let i = 0; i < chars.length - 1; i++) {
    if (/[一-龥]/.test(chars[i]) && /[一-龥]/.test(chars[i + 1])) {
      tokens.push(chars[i] + chars[i + 1]);
    }
  }

  return tokens;
}

function buildInvertedIndex(documents: SearchDocument[]): InvertedIndex {
  const index: InvertedIndex = {};

  for (const doc of documents) {
    const text = doc.refType === 'WORK'
      ? `${doc.title} ${doc.poetName || ''}`
      : doc.title;

    const tokens = tokenize(text);
    const uniqueTokens = new Set(tokens);

    for (const token of uniqueTokens) {
      if (!index[token]) {
        index[token] = [];
      }
      index[token].push(doc.id);
    }
  }

  return index;
}

function main() {
  console.log('=== 文气项目全文检索索引构建 ===\n');

  console.log('读取数据...');
  const poets: Poet[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'poets.json'), 'utf-8')
  );
  const works: Work[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'works.json'), 'utf-8')
  );

  console.log(`  诗人数量: ${poets.length}`);
  console.log(`  作品数量: ${works.length}`);

  console.log('\n构建搜索文档...');
  const documents: SearchDocument[] = [];

  for (const poet of poets) {
    documents.push({
      id: `doc_poet_${poet.id}`,
      refType: 'POET',
      refId: poet.id,
      title: poet.name,
      content: '',
      dynasty: poet.dynasty,
      genre: null,
      poetName: null,
    });
  }

  for (const work of works) {
    const contentSnippet = work.text ? work.text.slice(0, 300) : '';
    documents.push({
      id: `doc_work_${work.id}`,
      refType: 'WORK',
      refId: work.id,
      title: work.title,
      content: contentSnippet,
      dynasty: work.dynasty,
      genre: work.genre,
      poetName: work.poetName,
    });
  }

  console.log(`  文档数量: ${documents.length}`);

  console.log('\n构建倒排索引...');
  const startTime = Date.now();
  const invertedIndex = buildInvertedIndex(documents);
  const buildTime = Date.now() - startTime;

  const indexSize = Object.keys(invertedIndex).length;
  console.log(`  索引大小: ${indexSize} 个词条`);
  console.log(`  构建耗时: ${buildTime}ms`);

  console.log('\n=== 索引统计 ===');
  let totalDocFreq = 0;
  let maxDocFreq = 0;
  let maxDocFreqToken = '';

  for (const [token, docIds] of Object.entries(invertedIndex)) {
    totalDocFreq += docIds.length;
    if (docIds.length > maxDocFreq) {
      maxDocFreq = docIds.length;
      maxDocFreqToken = token;
    }
  }

  const avgDocFreq = totalDocFreq / indexSize;
  console.log(`  平均文档频率: ${avgDocFreq.toFixed(2)}`);
  console.log(`  最大文档频率: ${maxDocFreq} (词条: "${maxDocFreqToken}")`);

  console.log('\n示例词条:');
  const sampleTokens = Object.keys(invertedIndex).slice(0, 10);
  for (const token of sampleTokens) {
    console.log(`  "${token}": ${invertedIndex[token].length} 个文档`);
  }

  console.log('\n=== 测试搜索 ===');

  console.log('\n搜索 "李白":');
  const libaiTokens = tokenize('李白');
  const libaiResults = new Set<string>();
  for (const token of libaiTokens) {
    if (invertedIndex[token]) {
      for (const docId of invertedIndex[token]) {
        libaiResults.add(docId);
      }
    }
  }
  console.log(`  找到 ${libaiResults.size} 个文档`);
  const libaiDocs = documents.filter(d => libaiResults.has(d.id)).slice(0, 5);
  for (const doc of libaiDocs) {
    console.log(`  - ${doc.title} (${doc.refType === 'POET' ? '诗人' : '作品'})`);
  }

  console.log('\n搜索 "静夜思":');
  const jingyeTokens = tokenize('静夜思');
  const jingyeResults = new Set<string>();
  for (const token of jingyeTokens) {
    if (invertedIndex[token]) {
      for (const docId of invertedIndex[token]) {
        jingyeResults.add(docId);
      }
    }
  }
  console.log(`  找到 ${jingyeResults.size} 个文档`);
  const jingyeDocs = documents.filter(d => jingyeResults.has(d.id)).slice(0, 5);
  for (const doc of jingyeDocs) {
    console.log(`  - ${doc.title} (${doc.refType === 'POET' ? '诗人' : '作品'})`);
  }

  const indexData: SearchIndexData = {
    documents,
    invertedIndex,
    metadata: {
      documentCount: documents.length,
      indexSize,
      buildTime,
    },
  };

  console.log('\n保存索引...');
  fs.writeFileSync(
    path.join(DATA_DIR, 'search-index.json'),
    JSON.stringify(indexData),
    'utf-8'
  );
  console.log('  已保存 search-index.json');

  const manifest = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf-8')
  );
  const existing = new Map(manifest.files.map((f: any) => [f.path, f]));
  existing.set('search-index.json', {
    path: 'search-index.json',
    type: 'search',
    size: fs.statSync(path.join(DATA_DIR, 'search-index.json')).size,
    hash: crypto.createHash('sha256').update(fs.readFileSync(path.join(DATA_DIR, 'search-index.json'))).digest('hex'),
  });
  manifest.files = Array.from(existing.values());
  fs.writeFileSync(
    path.join(DATA_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
  console.log('  已更新 manifest.json');

  console.log('\n=== 构建完成 ===');
}

main();
