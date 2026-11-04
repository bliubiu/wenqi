/**
 * bun:sqlite 的 vitest 桩：仅满足类型导入与模块解析，
 * 管线纯函数单测不触达数据库，无需真实实现。
 */
export type SQLQueryBindings = unknown;

export class Database {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-empty-function
  constructor(..._args: unknown[]) {}
}
