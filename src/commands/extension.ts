import type { Command, Context } from 'koishi';
import type { Config } from '../config';
import { logger } from '../index';
import type { ExtensionService } from '../services/extension-service';

/**
 * 扩展管理命令 .ext
 */
export function registerExtensionCommands(
  parent: Command,
  _ctx: Context,
  _config: Config,
  extensionService: ExtensionService
) {
  if (!extensionService) {
    return;
  }

  const cmd = parent.subcommand('.ext', '扩展/插件管理').usage('管理 Lua/JS 扩展插件');

  // 列出所有插件
  cmd
    .subcommand('.list', '列出已加载的插件')
    .alias('.ls')
    .action(async () => {
      try {
        const plugins = extensionService.listPlugins();

        if (plugins.length === 0) {
          return '当前没有加载任何插件';
        }

        const lines = [`已加载 ${plugins.length} 个插件:\n`];

        for (const plugin of plugins) {
          const { descriptor, scripts, commands } = plugin;
          lines.push(`${descriptor.title || descriptor.name} v${descriptor.ver}`);
          if (descriptor.author) {
            lines.push(`   作者: ${descriptor.author}`);
          }
          if (descriptor.brief) {
            lines.push(`   简介: ${descriptor.brief}`);
          }
          lines.push(`   脚本: ${scripts.size} 个`);
          lines.push(`   命令: ${commands.size} 个`);
          lines.push('');
        }

        return lines.join('\n');
      } catch (error) {
        logger.error('列出插件失败:', error);
        const message = error instanceof Error ? error.message : String(error);
        return `获取插件列表失败: ${message}`;
      }
    });

  // 查看插件详情
  cmd.subcommand('.info <name:text>', '查看插件详细信息').action(async (_, name) => {
    if (!name) {
      return '请指定插件名称';
    }

    try {
      const plugin = extensionService.getPlugin(name);

      if (!plugin) {
        return `插件 "${name}" 不存在`;
      }

      const { descriptor, scripts, commands } = plugin;
      const lines = [
        `${descriptor.title || descriptor.name}`,
        `版本: ${descriptor.ver}`,
        descriptor.author ? `作者: ${descriptor.author}` : null,
        descriptor.brief ? `简介: ${descriptor.brief}` : null,
        descriptor.desc ? `\n描述:\n${descriptor.desc}` : null,
        descriptor.repo ? `\n仓库: ${descriptor.repo}` : null,
        `\n脚本 (${scripts.size}):`
      ].filter(Boolean);

      for (const scriptName of scripts.keys()) {
        lines.push(`  - ${scriptName}`);
      }

      if (commands.size > 0) {
        lines.push(`\n命令 (${commands.size}):`);
        for (const [cmdName, config] of commands) {
          const keyword = config.keyword || {};
          const trigger =
            keyword.prefix ??
            keyword.Prefix ??
            keyword.match ??
            keyword.Match ??
            keyword.search ??
            keyword.Search ??
            keyword.regex ??
            keyword.Regex ??
            `.${cmdName}`;
          const echo = config.echo;
          const target =
            typeof echo === 'object' && !Array.isArray(echo)
              ? echo.lua || echo.js || echo.text || '[deck]'
              : '[text]';
          lines.push(`  ${String(trigger)} -> ${target}`);
        }
      }

      return lines.join('\n');
    } catch (error) {
      logger.error('获取插件信息失败:', error);
      const message = error instanceof Error ? error.message : String(error);
      return `获取插件信息失败: ${message}`;
    }
  });

  // 重载插件
  cmd.subcommand('.reload <name:text>', '重新加载插件').action(async (_, name) => {
    if (!name) {
      return '请指定插件名称';
    }

    try {
      const success = await extensionService.reloadPlugin(name);

      if (success) {
        return `插件 "${name}" 重载成功`;
      } else {
        return `插件 "${name}" 重载失败`;
      }
    } catch (error) {
      logger.error('重载插件失败:', error);
      const message = error instanceof Error ? error.message : String(error);
      return `重载插件失败: ${message}`;
    }
  });

  // 列出 WASM 中已加载的扩展
  cmd.subcommand('.wasm', '列出 WASM 中已加载的扩展').action(async () => {
    try {
      return extensionService.inspectNativeExtensions();
    } catch (error) {
      logger.error('获取 WASM 扩展列表失败:', error);
      return `获取失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  return cmd;
}
