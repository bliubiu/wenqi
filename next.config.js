/** @type {import('next').NextConfig} */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

/** 构建期读取统一配置文件 application.yml，注入前端可访问的环境变量 */
function loadAppConfig() {
  const file = path.join(__dirname, 'application.yml');
  try {
    return parse(readFileSync(file, 'utf8')) ?? {};
  } catch (error) {
    throw new Error(`读取 application.yml 失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

const nextConfig = {
  output: 'export',
  // 允许 127.0.0.1 访问开发期资源（Playwright e2e 以 localhost 为 baseURL 时消除跨域警告）
  allowedDevOrigins: ['127.0.0.1'],
  images: {
    unoptimized: true,
  },
  turbopack: {},
  env: {
    NEXT_PUBLIC_WENQI_CONFIG: JSON.stringify(loadAppConfig()),
  },
};

module.exports = nextConfig;
