import type { Command } from 'koishi';
import type { Config } from '../config';
import { logger } from '../index';

/**
 * 安价/安科状态管理
 */
interface AnkoSession {
  title: string;
  options: string[];
  channelId: string;
  createdAt: number;
}

// 使用 Map 存储每个频道的安价会话
const ankoSessions = new Map<string, AnkoSession>();

/**
 * 安价命令 .ak
 */
export function registerAnkoCommands(parent: Command, _config: Config) {
  const cmd = parent
    .subcommand('.ak [...args:text]', '安价/安科 - 分歧选择系统')
    .usage(
      '安价/安科命令\n' +
        '.ak# [标题] 或 .ak new [标题] - 新建分歧\n' +
        '.ak+ [选项] 或 .ak add [选项] - 添加选项（用|分隔可添加多个）\n' +
        '.ak- [序号] 或 .ak del [序号] - 删除选项\n' +
        '.ak= 或 .ak get - 随机抽取一个选项\n' +
        '.ak show - 查看当前分歧\n' +
        '.ak clr - 清除当前分歧'
    )
    .action(async ({ session }, ...args) => {
      if (!session) {
        return '无法获取会话信息';
      }

      const channelId = session.guildId || session.channelId || session.userId;
      if (!channelId) {
        return '无法获取频道或用户信息';
      }

      const input = args.join(' ').trim();

      // 解析命令
      if (!input || input === 'show') {
        return showAnko(channelId);
      }

      // 新建分歧: .ak# 或 .ak new
      if (input.startsWith('#') || input.startsWith('new ') || input === 'new') {
        const title = input.startsWith('#') ? input.substring(1).trim() : input.substring(3).trim();
        return createAnko(channelId, title);
      }

      // 添加选项: .ak+ 或 .ak add
      if (input.startsWith('+') || input.startsWith('add ')) {
        const options = input.startsWith('+')
          ? input.substring(1).trim()
          : input.substring(3).trim();
        return addOptions(channelId, options);
      }

      // 删除选项: .ak- 或 .ak del
      if (input.startsWith('-') || input.startsWith('del ')) {
        const indexStr = input.startsWith('-')
          ? input.substring(1).trim()
          : input.substring(3).trim();
        const index = parseInt(indexStr, 10);
        return deleteOption(channelId, index);
      }

      // 随机抽取: .ak= 或 .ak get
      if (input === '=' || input === 'get') {
        return getRandomOption(channelId, session.username || session.userId || '用户');
      }

      // 清除分歧: .ak clr
      if (input === 'clr' || input === 'clear') {
        return clearAnko(channelId);
      }

      return '未知命令，使用 .ak 查看帮助';
    });

  return cmd;
}

/**
 * 创建新的安价会话
 */
function createAnko(channelId: string, title: string): string {
  ankoSessions.set(channelId, {
    title: title || '未命名分歧',
    options: [],
    channelId,
    createdAt: Date.now()
  });

  logger.debug(`创建安价会话: ${channelId}, 标题: ${title}`);
  return `已创建新分歧${title ? `「${title}」` : ''}，请使用 .ak+ 添加选项`;
}

/**
 * 添加选项
 */
function addOptions(channelId: string, optionsText: string): string {
  const session = ankoSessions.get(channelId);
  if (!session) {
    return '当前没有进行中的分歧，请先使用 .ak# 创建';
  }

  if (!optionsText) {
    return '请输入要添加的选项';
  }

  // 支持用 | 分隔多个选项
  const newOptions = optionsText
    .split('|')
    .map((opt) => opt.trim())
    .filter((opt) => opt);

  if (newOptions.length === 0) {
    return '请输入有效的选项';
  }

  session.options.push(...newOptions);

  const optionList = newOptions
    .map((opt, idx) => `${session.options.length - newOptions.length + idx + 1}. ${opt}`)
    .join('\n');

  return `已添加 ${newOptions.length} 个选项:\n${optionList}`;
}

/**
 * 删除选项
 */
function deleteOption(channelId: string, index: number): string {
  const session = ankoSessions.get(channelId);
  if (!session) {
    return '当前没有进行中的分歧';
  }

  if (Number.isNaN(index) || index < 1 || index > session.options.length) {
    return `无效的序号，请输入 1-${session.options.length} 之间的数字`;
  }

  const [deleted] = session.options.splice(index - 1, 1);
  return deleted ? `已删除选项 ${index}: ${deleted}` : '未找到要删除的选项';
}

/**
 * 随机抽取选项
 */
function getRandomOption(channelId: string, username: string): string {
  const session = ankoSessions.get(channelId);
  if (!session) {
    return '当前没有进行中的分歧';
  }

  if (session.options.length === 0) {
    return '当前分歧没有任何选项';
  }

  // 随机选择
  const randomIndex = Math.floor(Math.random() * session.options.length);
  const selected = session.options[randomIndex];
  if (!selected) {
    return '当前分歧没有任何选项';
  }

  // 清除会话
  ankoSessions.delete(channelId);

  return (
    `${username} 的安价结果:\n` +
    `「${session.title}」\n` +
    `抽取到: ${randomIndex + 1}. ${selected}`
  );
}

/**
 * 显示当前分歧
 */
function showAnko(channelId: string): string {
  const session = ankoSessions.get(channelId);
  if (!session) {
    return '当前没有进行中的分歧\n使用 .ak# [标题] 创建新分歧';
  }

  if (session.options.length === 0) {
    return `分歧「${session.title}」\n暂无选项，使用 .ak+ 添加选项`;
  }

  const optionList = session.options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n');

  return (
    `分歧「${session.title}」\n` +
    `共 ${session.options.length} 个选项:\n${optionList}\n\n` +
    `使用 .ak= 随机抽取`
  );
}

/**
 * 清除分歧
 */
function clearAnko(channelId: string): string {
  const session = ankoSessions.get(channelId);
  if (!session) {
    return '当前没有进行中的分歧';
  }

  ankoSessions.delete(channelId);
  return `已清除分歧「${session.title}」`;
}

/**
 * 清理过期会话（可选，用于定时清理）
 */
export function cleanupExpiredAnkoSessions(maxAge: number = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  let cleaned = 0;

  for (const [channelId, session] of ankoSessions.entries()) {
    if (now - session.createdAt > maxAge) {
      ankoSessions.delete(channelId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`清理了 ${cleaned} 个过期的安价会话`);
  }
}
