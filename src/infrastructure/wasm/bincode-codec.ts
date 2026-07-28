/**
 * bincode 编解码器
 *
 * 通过 WASM 桥接实现浏览器端的 bincode 序列化/反序列化。
 * JS ↔ WASM 之间以 JSON 字符串中转（bincode 将 JSON 字符串视为不透明 String），
 * 避免 JS 端直接处理二进制格式。
 *
 * 使用约束：
 * - 仅序列化/反序列化纯数据对象（不含函数、Symbol、循环引用）
 * - 序列化结果不跨版本兼容（bincode 要求 Rust 结构体严格匹配）
 */

import type { WasmModule } from './bridge';

let wasmModule: WasmModule | null = null;

/**
 * 注册 WASM 模块引用，bincode 编解码器依赖此模块
 */
export function setWasmModule(mod: WasmModule): void {
  wasmModule = mod;
}

/**
 * 将 JS 值编码为 bincode 二进制 Uint8Array
 *
 * @param data  可 JSON 序列化的 JS 值
 * @returns     bincode 编码的 Uint8Array
 */
export async function bincodeEncode(data: unknown): Promise<Uint8Array> {
  if (!wasmModule) {
    throw new Error('bincode 编解码器未初始化（WASM 模块未加载）');
  }

  const jsonStr = JSON.stringify(data);
  const bytes = wasmModule.bincodeEncode(jsonStr);
  return bytes;
}

/**
 * 从 bincode 二进制 Uint8Array 解码为 JS 值
 *
 * @param bytes  bincode 编码的字节序列
 * @returns      解码后的 JS 值
 */
export async function bincodeDecode<T = unknown>(bytes: Uint8Array): Promise<T> {
  if (!wasmModule) {
    throw new Error('bincode 编解码器未初始化（WASM 模块未加载）');
  }

  const jsonStr = wasmModule.bincodeDecode(bytes);
  return JSON.parse(jsonStr) as T;
}

/**
 * 检查 bincode 编解码器是否可用
 */
export function isBincodeAvailable(): boolean {
  return wasmModule !== null && typeof wasmModule.bincodeEncode === 'function';
}
