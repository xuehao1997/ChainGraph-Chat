// DeepSeek 接入配置，全部来自环境变量（见 server/.env，参考 server/.env.example）。
// 密钥不设默认值，避免明文写进代码被提交泄露。
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
  console.warn(
    '[StreamBench] 未检测到 DEEPSEEK_API_KEY，请在 server/.env 中配置后重启。',
  );
}

// DeepSeek 与 OpenAI 接口兼容
export const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

export const PORT = Number(process.env.PORT) || 3001;
