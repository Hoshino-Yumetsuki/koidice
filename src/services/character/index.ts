/**
 * 人物卡服务模块
 * 重新导出所有功能
 */

export * from './card-operations';
export * from './card-binding';
export * from './card-stats';

// 重新导出主服务类
import type { Context, Session } from 'koishi';
import type { DiceAdapter } from '../../wasm/adapter';
import type { CharacterStats } from '../../database';
import * as CardOps from './card-operations';
import * as CardBinding from './card-binding';
import * as CardStats from './card-stats';

/**
 * 人物卡服务
 * 负责人物卡的 CRUD 操作，结合 Koishi 数据库和 Dice C++ 实现
 */
export class CharacterService {
  constructor(
    private ctx: Context,
    private diceAdapter: DiceAdapter
  ) {}

  // 卡片操作
  getActiveCard(session: Session) {
    return CardOps.getActiveCard(this.ctx, session);
  }

  getAllCards(session: Session) {
    return CardOps.getAllCards(this.ctx, session);
  }

  getCard(session: Session, cardName: string) {
    return CardOps.getCard(this.ctx, session, cardName);
  }

  createCard(
    session: Session,
    cardName: string,
    cardType?: string,
    attributes?: Record<string, number>
  ) {
    return CardOps.createCard(this.ctx, session, cardName, cardType, attributes);
  }

  setAttributes(session: Session, cardName: string | null, attributes: Record<string, number>) {
    return CardOps.setAttributes(this.ctx, session, cardName, attributes);
  }

  getAttributes(session: Session, cardName: string | null) {
    return CardOps.getAttributes(this.ctx, session, cardName);
  }

  switchCard(session: Session, cardName: string) {
    return CardOps.switchCard(this.ctx, session, cardName);
  }

  deleteCard(session: Session, cardName: string) {
    return CardOps.deleteCard(this.ctx, session, cardName);
  }

  parseAndSetCOCAttributes(session: Session, cardName: string | null, cocOutput: string) {
    return CardOps.parseAndSetCOCAttributes(
      this.ctx,
      this.diceAdapter,
      session,
      cardName,
      cocOutput
    );
  }

  renameCard(session: Session, oldName: string, newName: string) {
    return CardOps.renameCard(this.ctx, session, oldName, newName);
  }

  copyCard(session: Session, sourceName: string, targetName: string) {
    return CardOps.copyCard(this.ctx, session, sourceName, targetName);
  }

  clearAllCards(session: Session) {
    return CardOps.clearAllCards(this.ctx, session);
  }

  // 绑定操作
  getBoundCard(session: Session) {
    return CardBinding.getBoundCard(this.ctx, session);
  }

  bindCard(session: Session, cardName: string | null) {
    return CardBinding.bindCard(this.ctx, session, cardName);
  }

  getAllBindings(session: Session) {
    return CardBinding.getAllBindings(this.ctx, session);
  }

  // 统计操作
  getStats(session: Session, cardName: string | null) {
    return CardStats.getStats(this.ctx, session, cardName);
  }

  updateStats(
    session: Session,
    cardName: string,
    statsUpdate: Partial<
      Pick<
        CharacterStats,
        | 'totalRolls'
        | 'criticalSuccess'
        | 'extremeSuccess'
        | 'hardSuccess'
        | 'regularSuccess'
        | 'failure'
        | 'fumble'
      >
    >
  ) {
    return CardStats.updateStats(this.ctx, session, cardName, statsUpdate);
  }
}
