import type { Command } from 'koishi';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { logger } from '../index';

/**
 * 疯狂症状命令 .ti / .li
 */
export function registerInsanityCommands(
  parent: Command,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  // 临时疯狂症状 .ti
  parent.subcommand('.ti', '临时疯狂症状').action(async ({ session }) => {
    if (!session) {
      return '无法获取会话信息';
    }
    try {
      // 1d10 决定症状类型
      const typeRoll = diceAdapter.roll('1d10', 10);
      if (typeRoll.errorCode !== 0) {
        return `掷骰失败: ${typeRoll.errorMsg}`;
      }

      const symptomType = typeRoll.total;
      let symptom = diceAdapter.getTempInsanity(symptomType);

      if (!symptom || symptom.includes('索引超出范围')) {
        return '症状表索引错误';
      }

      // 1d10 决定持续时间（轮数）
      const durRoll = diceAdapter.roll('1d10', 10);
      const duration = durRoll.total;

      // 替换占位符
      symptom = symptom.replace(/{dur}/g, duration.toString());
      symptom = symptom.replace(/{pc}/g, session.username);
      symptom = symptom.replace(/{nick}/g, session.username);

      // 如果需要详细症状（恐惧或躁狂）
      if (symptomType === 9 || symptomType === 10) {
        const detailRoll = diceAdapter.roll('1d100', 100);
        const detailIndex = detailRoll.total;

        let detail: string;
        if (symptomType === 9) {
          // 恐惧症
          detail = diceAdapter.getPhobia(detailIndex);
        } else {
          // 躁狂症
          detail = diceAdapter.getMania(detailIndex);
        }

        symptom = symptom.replace(/{detail_roll}/g, `1d100=${detailIndex}`);
        symptom = symptom.replace(/{detail}/g, detail);
      }

      return `${session.username} 的临时疯狂症状:\n${symptom}`;
    } catch (error) {
      logger.error('临时疯狂症状错误:', error);
      return '生成临时疯狂症状时发生错误';
    }
  });

  // 永久/不定疯狂症状 .li
  parent.subcommand('.li', '永久/不定疯狂症状').action(async ({ session }) => {
    if (!session) {
      return '无法获取会话信息';
    }
    try {
      // 1d10 决定症状类型
      const typeRoll = diceAdapter.roll('1d10', 10);
      if (typeRoll.errorCode !== 0) {
        return `掷骰失败: ${typeRoll.errorMsg}`;
      }

      const symptomType = typeRoll.total;
      let symptom = diceAdapter.getLongInsanity(symptomType);

      if (!symptom || symptom.includes('索引超出范围')) {
        return '症状表索引错误';
      }

      // 1d10 决定持续时间（小时）
      const durRoll = diceAdapter.roll('1d10', 10);
      const duration = durRoll.total;

      // 替换占位符
      symptom = symptom.replace(/{dur}/g, duration.toString());
      symptom = symptom.replace(/{pc}/g, session.username);
      symptom = symptom.replace(/{nick}/g, session.username);

      // 如果需要详细症状（恐惧或躁狂）
      if (symptomType === 9 || symptomType === 10) {
        const detailRoll = diceAdapter.roll('1d100', 100);
        const detailIndex = detailRoll.total;

        let detail: string;
        if (symptomType === 9) {
          // 恐惧症
          detail = diceAdapter.getPhobia(detailIndex);
        } else {
          // 躁狂症
          detail = diceAdapter.getMania(detailIndex);
        }

        symptom = symptom.replace(/{detail_roll}/g, `1d100=${detailIndex}`);
        symptom = symptom.replace(/{detail}/g, detail);
      }

      return `${session.username} 的永久/不定疯狂症状:\n${symptom}`;
    } catch (error) {
      logger.error('永久疯狂症状错误:', error);
      return '生成永久疯狂症状时发生错误';
    }
  });
}
