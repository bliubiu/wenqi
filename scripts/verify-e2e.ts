#!/usr/bin/env bun
/**
 * 文气 E2E 幂等验证脚本
 *
 * 一键完成「环境预检 → 幂等清理 → Playwright 全量 E2E → 结果汇总报告」，
 * 任意次数重复运行结果稳定（幂等），详见 docs/11-E2E验证指南.md。
 *
 * 幂等保证：
 *   1. 运行前终止 3000 端口残留的旧 dev server，确保 Playwright 以最新代码启动服务
 *      （playwright.config.ts 的 reuseExistingServer 只在端口空闲时才自启）；
 *   2. 清空 e2e-report/ 与 test-results/ 旧产物，报告不累积、失败痕迹不串场；
 *   3. 每条用例使用独立浏览器上下文与预置存储标记，不依赖运行顺序与历史状态；
 *   4. 数据库等数据资产只读，不做任何写入。
 *
 * 用法：
 *   bun run verify:e2e                       # 全量验证
 *   bun run verify:e2e -- --project=mobile-chrome   # 参数透传给 playwright test
 */

import { existsSync, statSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const PREFIX = '[文气验证]';

/** 当前本地时间 YYYY-MM-DD HH:MM:SS */
function now(): string {
  const d = new Date();
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 毫秒 → 中文可读时长 */
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}

function log(message: string): void {
  console.log(`${PREFIX} ${message}`);
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/** 环境预检（只读，不修复） */
function precheck(): CheckResult[] {
  const results: CheckResult[] = [];

  // 依赖完整性
  const nodeModules = path.join(ROOT, 'node_modules');
  results.push({
    name: '依赖（node_modules）',
    ok: existsSync(nodeModules),
    detail: existsSync(nodeModules) ? '就绪' : '缺失，请先执行 bun install',
  });

  // 数据底座
  const db = path.join(ROOT, 'data', 'wenqi.db');
  let dbOk = false;
  let dbDetail = '缺失，请先执行数据入库（bun run db:import 等）';
  if (existsSync(db)) {
    const sizeMb = statSync(db).size / 1024 / 1024;
    dbOk = sizeMb > 1;
    dbDetail = `${sizeMb.toFixed(1)} MB`;
  }
  results.push({ name: '数据底座（data/wenqi.db）', ok: dbOk, detail: dbDetail });

  // 测试用浏览器（Playwright channel: chrome 复用系统 Chrome）
  const chromeCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  const chromePath = chromeCandidates.find((p) => existsSync(p));
  results.push({
    name: '系统 Chrome（channel: chrome）',
    ok: Boolean(chromePath),
    detail: chromePath ?? '未找到，请安装 Chrome 或调整 playwright.config.ts',
  });

  // E2E 用例目录
  const e2eDir = path.join(ROOT, 'e2e');
  results.push({
    name: 'E2E 用例（e2e/）',
    ok: existsSync(e2eDir),
    detail: existsSync(e2eDir) ? '就绪' : '缺失',
  });

  return results;
}

/** 终止 3000 端口残留的监听进程（Windows），返回动作描述 */
function killStaleServer(): string[] {
  if (process.platform !== 'win32') {
    return ['非 Windows 平台：跳过端口清理（请自行确保 3000 端口空闲）'];
  }
  const netstat = Bun.spawnSync({ cmd: ['netstat', '-ano'], stdout: 'pipe', stderr: 'pipe' });
  const text = new TextDecoder().decode(netstat.stdout);
  const pids = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.includes(':3000') && /LISTENING/i.test(line)) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
  }
  const actions: string[] = [];
  for (const pid of pids) {
    const kill = Bun.spawnSync({ cmd: ['taskkill', '/PID', pid, '/F', '/T'], stdout: 'pipe', stderr: 'pipe' });
    actions.push(`终止 3000 端口残留进程 PID ${pid}（${kill.exitCode === 0 ? '成功' : '失败'}）`);
  }
  if (actions.length === 0) actions.push('3000 端口空闲，无需清理');
  return actions;
}

interface CaseResult {
  status: 'ok' | 'x' | 's';
  project: string;
  name: string;
  duration: string;
}

interface ParsedOutput {
  cases: CaseResult[];
  passed: number;
  failed: number;
  skipped: number;
}

/** 解析 Playwright list 报告输出 */
function parsePlaywrightOutput(output: string): ParsedOutput {
  const cases: CaseResult[] = [];
  const caseRe = /^ {2}(ok|x|s) {1,2}(\d+) \[([^\]]+)\] › (.+) \((\d+(?:\.\d+)?)(ms|s|m)\)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = caseRe.exec(output)) !== null) {
    const [, status, , project, name, value, unit] = match;
    const ms = unit === 'm' ? Number(value) * 60 : unit === 's' ? Number(value) : Number(value) / 1000;
    cases.push({ status: status as CaseResult['status'], project, name, duration: formatDuration(ms * 1000) });
  }

  const count = (word: string): number => {
    const m = output.match(new RegExp(`\\s(\\d+) ${word}`));
    return m ? Number(m[1]) : 0;
  };
  return { cases, passed: count('passed'), failed: count('failed'), skipped: count('skipped') };
}

async function main(): Promise<number> {
  const startedAt = Date.now();
  const startTime = now();
  log(`开始 E2E 幂等验证（${startTime}）`);
  const passThrough = process.argv.slice(2).filter((a) => a !== '--');
  if (passThrough.length > 0) log(`透传参数：${passThrough.join(' ')}`);

  // 1. 环境预检
  log('── 阶段 1/4：环境预检 ──');
  const checks = precheck();
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}：${c.detail}`);
  }
  if (checks.some((c) => !c.ok)) {
    console.error(`${PREFIX} 预检未通过，终止验证。请按上述提示处理后重试。`);
    return 1;
  }

  // 2. 幂等清理
  log('── 阶段 2/4：幂等清理 ──');
  const cleanActions: string[] = [...killStaleServer()];
  for (const dir of ['e2e-report', 'test-results']) {
    rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  }
  mkdirSync(path.join(ROOT, 'e2e-report'), { recursive: true });
  cleanActions.push('清空 e2e-report/ 与 test-results/ 旧产物');
  for (const a of cleanActions) console.log(`  · ${a}`);

  // 3. 执行 Playwright 全量 E2E（流式回显 + 捕获）
  log('── 阶段 3/4：执行 Playwright E2E ──');
  const proc = Bun.spawn({
    cmd: ['bunx', 'playwright', 'test', ...passThrough],
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const chunks: Promise<void>[] = [];
  const buffers = { stdout: '', stderr: '' };
  const pump = async (stream: ReadableStream<Uint8Array> | null, key: 'stdout' | 'stderr'): Promise<void> => {
    if (!stream) return;
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        buffers[key] += text;
        process.stdout.write(text); // 实时回显
      }
    } finally {
      reader.releaseLock();
    }
  };
  chunks.push(pump(proc.stdout as ReadableStream<Uint8Array>, 'stdout'));
  chunks.push(pump(proc.stderr as ReadableStream<Uint8Array>, 'stderr'));
  await Promise.all(chunks);
  await proc.exited;
  const exitCode = proc.exitCode ?? 1;

  // 4. 汇总报告
  log('── 阶段 4/4：汇总报告 ──');
  const parsed = parsePlaywrightOutput(buffers.stdout);
  const total = parsed.cases.length;
  const failed = Math.max(parsed.failed, exitCode === 0 ? 0 : 1);
  const pass = failed === 0 && parsed.passed > 0;
  const duration = formatDuration(Date.now() - startedAt);

  const reportName = `verify-${startTime.replace(/[-: ]/g, '').slice(0, 15)}.md`;
  const reportPath = path.join(ROOT, 'e2e-report', reportName);
  const reportLines = [
    '# 文气 E2E 幂等验证报告',
    '',
    `- 执行时间：${startTime}`,
    `- 总耗时：${duration}`,
    `- 结论：${pass ? '✅ 通过' : '❌ 未通过'}（通过 ${parsed.passed} / 失败 ${parsed.failed} / 跳过 ${parsed.skipped}）`,
    `- Playwright 退出码：${exitCode}`,
    '',
    '## 1. 环境预检',
    '',
    '| 检查项 | 结果 | 详情 |',
    '| --- | --- | --- |',
    ...checks.map((c) => `| ${c.name} | ${c.ok ? '✓' : '✗'} | ${c.detail} |`),
    '',
    '## 2. 幂等清理动作',
    '',
    ...cleanActions.map((a) => `- ${a}`),
    '',
    '## 3. 用例结果',
    '',
    total > 0
      ? [
          '| # | 状态 | 项目 | 用例 | 耗时 |',
          '| --- | --- | --- | --- | --- |',
          ...parsed.cases.map(
            (c, i) =>
              `| ${i + 1} | ${c.status === 'ok' ? '✅' : c.status === 's' ? '⏭️ 跳过' : '❌'} | ${c.project} | ${c.name} | ${c.duration} |`,
          ),
        ].join('\n')
      : '_未解析到用例行，请查看附录完整输出。_',
    '',
    '## 附录：完整输出',
    '',
    '<details><summary>Playwright stdout</summary>',
    '',
    '```text',
    buffers.stdout.trimEnd() || '（无输出）',
    '```',
    '',
    '</details>',
    '',
    '<details><summary>Playwright stderr</summary>',
    '',
    '```text',
    buffers.stderr.trimEnd() || '（无输出）',
    '```',
    '',
    '</details>',
    '',
  ];
  writeFileSync(reportPath, reportLines.join('\n'), 'utf8');

  for (const c of parsed.cases) {
    console.log(`  ${c.status === 'ok' ? '✅' : c.status === 's' ? '⏭️' : '❌'} [${c.project}] ${c.name}（${c.duration}）`);
  }
  log(`验证${pass ? '通过' : '未通过'}：通过 ${parsed.passed} / 失败 ${parsed.failed} / 跳过 ${parsed.skipped}，总耗时 ${duration}`);
  log(`报告已写入 ${path.relative(ROOT, reportPath)}`);
  return pass ? 0 : 1;
}

process.exitCode = await main();
