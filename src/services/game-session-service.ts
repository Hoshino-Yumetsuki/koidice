import type { Context, Session } from 'koishi';
import type { GameSession } from '../database';
import { logger } from '../index';

/**
 * 游戏会话服务
 * 管理 TRPG 游戏会话，包括 GM、玩家、旁观者、游戏区域等
 */
export class GameSessionService {
  private sessionCounter = 0;

  constructor(private ctx: Context) {}

  /**
   * 获取会话标识
   */
  private getSessionKey(session: Session): {
    guildId: string;
    platform: string;
  } {
    const guildId = session.guildId || session.channelId || session.userId;
    if (!guildId) throw new Error('无法获取会话信息');

    return {
      guildId,
      platform: session.platform
    };
  }

  /**
   * 获取当前窗口的游戏会话
   */
  async getSession(session: Session): Promise<GameSession | null> {
    const { guildId, platform } = this.getSessionKey(session);

    const sessions = await this.ctx.database.get('koidice_game_session', {
      platform
    });

    // 查找包含当前群组的游戏会话
    for (const gameSession of sessions) {
      const areas = JSON.parse(gameSession.areas || '[]');
      if (areas.includes(guildId)) {
        return gameSession;
      }
    }

    return null;
  }

  /**
   * 根据名称获取游戏会话
   */
  async getSessionByName(name: string, platform: string): Promise<GameSession | null> {
    const sessions = await this.ctx.database.get('koidice_game_session', {
      name,
      platform
    });
    return sessions[0] || null;
  }

  /**
   * 创建新游戏会话
   */
  async createSession(session: Session, name?: string): Promise<GameSession> {
    const { guildId, platform } = this.getSessionKey(session);

    // 生成游戏名称
    if (!name) {
      this.sessionCounter++;
      name = `新游戏#${this.sessionCounter}`;
    }

    // 检查是否已存在同名游戏
    const existing = await this.getSessionByName(name, platform);
    if (existing) {
      throw new Error(`游戏 "${name}" 已存在`);
    }

    // 创建游戏会话
    const gameSession: Partial<GameSession> = {
      name,
      guildId,
      platform,
      gmList: JSON.stringify([]),
      playerList: JSON.stringify([]),
      observerList: JSON.stringify([]),
      areas: JSON.stringify([guildId]),
      config: JSON.stringify({}),
      roulette: JSON.stringify({}),
      isLogging: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const created = await this.ctx.database.create('koidice_game_session', gameSession as any);
    logger.info(`创建游戏会话: ${name} (${guildId})`);
    return created as GameSession;
  }

  /**
   * 销毁游戏会话
   */
  async destroySession(gameId: number): Promise<void> {
    await this.ctx.database.remove('koidice_game_session', { id: gameId });
    logger.info(`销毁游戏会话: ${gameId}`);
  }

  /**
   * 添加 GM
   */
  async addGM(gameId: number, userId: string): Promise<boolean> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return false;

    const gmList = JSON.parse(game.gmList || '[]');
    if (gmList.includes(userId)) return false;

    gmList.push(userId);
    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        gmList: JSON.stringify(gmList),
        updatedAt: new Date()
      }
    );
    return true;
  }

  /**
   * 移除 GM
   */
  async removeGM(gameId: number, userId: string): Promise<boolean> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return false;

    const gmList = JSON.parse(game.gmList || '[]');
    const index = gmList.indexOf(userId);
    if (index === -1) return false;

    gmList.splice(index, 1);
    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        gmList: JSON.stringify(gmList),
        updatedAt: new Date()
      }
    );
    return true;
  }

  /**
   * 添加玩家
   */
  async addPlayer(gameId: number, userId: string): Promise<boolean> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return false;

    const playerList = JSON.parse(game.playerList || '[]');
    if (playerList.includes(userId)) return false;

    playerList.push(userId);
    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        playerList: JSON.stringify(playerList),
        updatedAt: new Date()
      }
    );
    return true;
  }

  /**
   * 移除玩家
   */
  async removePlayer(gameId: number, userId: string): Promise<boolean> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return false;

    const playerList = JSON.parse(game.playerList || '[]');
    const index = playerList.indexOf(userId);
    if (index === -1) return false;

    playerList.splice(index, 1);
    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        playerList: JSON.stringify(playerList),
        updatedAt: new Date()
      }
    );
    return true;
  }

  /**
   * 添加旁观者
   */
  async addObserver(gameId: number, userId: string): Promise<boolean> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return false;

    const observerList = JSON.parse(game.observerList || '[]');
    if (observerList.includes(userId)) return false;

    observerList.push(userId);
    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        observerList: JSON.stringify(observerList),
        updatedAt: new Date()
      }
    );
    return true;
  }

  /**
   * 移除旁观者
   */
  async removeObserver(gameId: number, userId: string): Promise<boolean> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return false;

    const observerList = JSON.parse(game.observerList || '[]');
    const index = observerList.indexOf(userId);
    if (index === -1) return false;

    observerList.splice(index, 1);
    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        observerList: JSON.stringify(observerList),
        updatedAt: new Date()
      }
    );
    return true;
  }

  /**
   * 添加游戏区域
   */
  async addArea(gameId: number, guildId: string): Promise<boolean> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return false;

    const areas = JSON.parse(game.areas || '[]');
    if (areas.includes(guildId)) return false;

    areas.push(guildId);
    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        areas: JSON.stringify(areas),
        updatedAt: new Date()
      }
    );
    return true;
  }

  /**
   * 移除游戏区域
   */
  async removeArea(gameId: number, guildId: string): Promise<boolean> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return false;

    const areas = JSON.parse(game.areas || '[]');
    const index = areas.indexOf(guildId);
    if (index === -1) return false;

    areas.splice(index, 1);
    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        areas: JSON.stringify(areas),
        updatedAt: new Date()
      }
    );
    return true;
  }

  /**
   * 设置游戏配置
   */
  async setConfig(gameId: number, key: string, value: any): Promise<void> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return;

    const config = JSON.parse(game.config || '{}');
    config[key] = value;

    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        config: JSON.stringify(config),
        updatedAt: new Date()
      }
    );
  }

  /**
   * 获取游戏配置
   */
  async getConfig(gameId: number, key: string): Promise<any> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return undefined;

    const config = JSON.parse(game.config || '{}');
    return config[key];
  }

  /**
   * 设置轮盘骰
   */
  async setRoulette(gameId: number, face: number, data: any): Promise<void> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return;

    const roulette = JSON.parse(game.roulette || '{}');
    roulette[face] = data;

    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        roulette: JSON.stringify(roulette),
        updatedAt: new Date()
      }
    );
  }

  /**
   * 获取轮盘骰
   */
  async getRoulette(gameId: number, face: number): Promise<any> {
    const [game] = await this.ctx.database.get('koidice_game_session', {
      id: gameId
    });
    if (!game) return undefined;

    const roulette = JSON.parse(game.roulette || '{}');
    return roulette[face];
  }

  /**
   * 清空轮盘骰
   */
  async clearRoulette(gameId: number): Promise<void> {
    await this.ctx.database.set(
      'koidice_game_session',
      { id: gameId },
      {
        roulette: JSON.stringify({}),
        updatedAt: new Date()
      }
    );
  }

  /**
   * 转换为扩展上下文格式
   */
  gameToContext(game: GameSession): any {
    return {
      name: game.name,
      gm: JSON.parse(game.gmList || '[]'),
      pls: JSON.parse(game.playerList || '[]'),
      obs: JSON.parse(game.observerList || '[]'),
      areas: JSON.parse(game.areas || '[]'),
      ...JSON.parse(game.config || '{}'),
      roulette: JSON.parse(game.roulette || '{}'),
      isLogging: game.isLogging
    };
  }

  /**
   * 检查用户是否是 GM
   */
  isGM(game: GameSession, userId: string): boolean {
    const gmList = JSON.parse(game.gmList || '[]');
    return gmList.includes(userId);
  }

  /**
   * 检查用户是否是玩家
   */
  isPlayer(game: GameSession, userId: string): boolean {
    const playerList = JSON.parse(game.playerList || '[]');
    return playerList.includes(userId);
  }

  /**
   * 检查用户是否是参与者（GM 或玩家）
   */
  isParticipant(game: GameSession, userId: string): boolean {
    return this.isGM(game, userId) || this.isPlayer(game, userId);
  }
}
