import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';

export const getCurrentTimeTool = tool(
  ({ timeZone }) => {
    const now = new Date();
    const zone = timeZone || 'Asia/Shanghai';

    return JSON.stringify({
      iso: now.toISOString(),
      locale: now.toLocaleString('zh-CN', {
        timeZone: zone,
        hour12: false,
      }),
      timeZone: zone,
    });
  },
  {
    name: 'get_current_time',
    description:
      '获取当前日期和时间。用户询问现在几点、今天日期、当前时间时使用。',
    schema: z.object({
      timeZone: z
        .string()
        .optional()
        .describe('IANA 时区名称，例如 Asia/Shanghai。默认 Asia/Shanghai。'),
    }),
  },
);

export const chatTools = [getCurrentTimeTool];
