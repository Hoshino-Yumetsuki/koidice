import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { logger } from '../../index';

/**
 * 加载规则文件（YAML 格式）
 */
export async function loadRulebooks(
  rulebookDir: string,
  pluginName: string,
  pluginRules: Map<string, any>
): Promise<void> {
  logger.debug(`Scanning rulebook directory: ${rulebookDir}`);
  const yaml = await import('js-yaml');
  const files = await fs.readdir(rulebookDir);
  logger.debug(`Found ${files.length} files in rulebook directory`);
  const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  logger.debug(`Found ${yamlFiles.length} YAML files`);

  for (const file of yamlFiles) {
    try {
      const filePath = path.join(rulebookDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const ruleData = yaml.load(content) as any;

      if (ruleData?.rule && ruleData.manual) {
        const ruleName = ruleData.rule;
        logger.info(`Loading rulebook: ${ruleName} from ${pluginName}`);

        // 将规则注入到规则缓存中
        pluginRules.set(ruleName, ruleData.manual);

        logger.info(
          `Loaded rulebook: ${ruleName} with ${Object.keys(ruleData.manual).length} entries`
        );
      }
    } catch (error) {
      logger.error(`Error loading rulebook ${file}:`, error);
    }
  }
}
