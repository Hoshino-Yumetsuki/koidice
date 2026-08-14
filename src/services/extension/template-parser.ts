/**
 * 插件角色卡模板解析器
 * 解析 Dice 插件的 XML 格式角色卡模板
 */
import { XMLParser } from 'fast-xml-parser';

export interface TemplateProperty {
  name: string; // 中文名
  alias: string; // 英文别名
  text?: string; // 计算公式类型 (如 'javascript')
  formula?: string; // 计算公式内容
  defaultValue?: number; // 默认值
}

export interface CharacterTemplate {
  name: string; // 模板名称
  properties: TemplateProperty[];
}

/**
 * 解析 XML 格式的角色卡模板
 * @param xmlContent XML 文件内容
 * @returns 解析后的模板对象
 */
export function parseTemplate(xmlContent: string): CharacterTemplate | null {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text'
    });

    const result = parser.parse(xmlContent);

    if (!result?.model) return null;

    const model = result.model;
    const templateName = model['@_name'];

    if (!templateName) return null;

    const properties: TemplateProperty[] = [];

    // 解析 property 节点
    if (model.property?.any) {
      const anyNodes = Array.isArray(model.property.any)
        ? model.property.any
        : [model.property.any];

      for (const node of anyNodes) {
        const name = node['@_name'];
        const alias = node['@_alias'];

        if (name && alias) {
          const prop: TemplateProperty = {
            name,
            alias
          };

          const text = node['@_text'];
          if (text) {
            prop.text = text;
            // 获取节点内容作为公式
            if (node['#text']) {
              prop.formula = node['#text'].trim();
            }
          }

          properties.push(prop);
        }
      }
    }

    return {
      name: templateName,
      properties
    };
  } catch (error) {
    console.error('解析模板失败:', error);
    return null;
  }
}

function evaluateFormula(formula: string): number {
  let index = 0;

  function skipWhitespace(): void {
    while (/\s/.test(formula[index] ?? '')) index++;
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (true) {
      skipWhitespace();
      const operator = formula[index];
      if (operator !== '+' && operator !== '-') return value;
      index++;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (true) {
      skipWhitespace();
      const operator = formula[index];
      if (operator !== '*' && operator !== '/' && operator !== '%') return value;
      index++;
      const right = parseFactor();
      if (operator === '*') value *= right;
      else if (operator === '/') value /= right;
      else value %= right;
    }
  }

  function parseFactor(): number {
    skipWhitespace();
    const operator = formula[index];
    if (operator === '+' || operator === '-') {
      index++;
      const value = parseFactor();
      return operator === '-' ? -value : value;
    }

    if (formula[index] === '(') {
      index++;
      const value = parseExpression();
      skipWhitespace();
      if (formula[index++] !== ')') throw new Error('缺少右括号');
      return value;
    }

    const match = formula.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) throw new Error('不支持的公式');
    index += match[0].length;
    return Number(match[0]);
  }

  const result = parseExpression();
  skipWhitespace();
  if (index !== formula.length) throw new Error('不支持的公式');
  return result;
}

/**
 * 根据模板生成默认属性
 * @param template 角色卡模板
 * @returns 属性对象 (只使用中文名)
 */
export function generateDefaultAttributes(template: CharacterTemplate): Record<string, number> {
  const attributes: Record<string, number> = {};

  for (const prop of template.properties) {
    // 如果有公式,先跳过,稍后计算
    if (prop.formula) {
      continue;
    }

    // 只使用中文名存储属性
    attributes[prop.name] = prop.defaultValue ?? 0;
  }

  // 计算带公式的属性
  for (const prop of template.properties) {
    if (prop.formula && prop.text === 'javascript') {
      try {
        // 简单的公式计算 (只支持基本的数学运算)
        let formula = prop.formula;

        // 替换 this.属性名 为实际值
        for (const p of template.properties) {
          const value = attributes[p.name] ?? 0;
          // 替换英文别名
          const aliasRegex = new RegExp(`this\\.${p.alias}`, 'g');
          formula = formula.replace(aliasRegex, String(value));
          // 替换中文名
          const nameRegex = new RegExp(`this\\.${p.name}`, 'g');
          formula = formula.replace(nameRegex, String(value));
        }

        const result = evaluateFormula(formula);
        attributes[prop.name] = Number.isFinite(result) ? result : 0;
      } catch (error) {
        console.error(`计算公式失败 (${prop.name}):`, error);
        attributes[prop.name] = 0;
      }
    }
  }

  return attributes;
}

/**
 * 创建属性别名映射表
 * @param template 角色卡模板
 * @returns 别名到中文名的映射
 */
export function createAliasMap(template: CharacterTemplate): Record<string, string> {
  const aliasMap: Record<string, string> = {};
  for (const prop of template.properties) {
    aliasMap[prop.alias] = prop.name;
  }
  return aliasMap;
}
