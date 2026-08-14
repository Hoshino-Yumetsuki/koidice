import type { Context } from 'koishi'
import type { DiceAdapter } from '../wasm'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as toml from '@iarna/toml'
import { logger } from '../index'
import { CharacterService } from './character'
import { GameSessionService } from './game-session-service'
import type {
  DescriptorJson,
  ReplyConfig,
  LoadedPlugin
} from './extension/types'
import { wrapLuaScript } from './extension/script-wrapper'
import { loadRulebooks } from './extension/rulebook-loader'
import { registerPluginCommands } from './extension/command-registry'
import {
  parseTemplate,
  createAliasMap,
  type CharacterTemplate
} from './extension/template-parser'

/** Dice build exposed by the pinned upstream revision 7e17e653. */
export const SUPPORTED_DICE_BUILD = 668

type Rulebook = Record<string, string>

interface DiscoveredPlugin {
  path: string
  descriptor: DescriptorJson
}

export class ExtensionService {
  private loadedPlugins = new Map<string, LoadedPlugin>()
  private pluginRules = new Map<string, Rulebook>()
  private pluginTemplates = new Map<string, CharacterTemplate>()
  private templateAliasMap = new Map<string, Record<string, string>>()
  private scriptOwners = new Map<string, string>()
  private templateOwners = new Map<string, string>()
  private ruleOwners = new Map<string, string>()
  private readonly pluginDir: string
  private readonly characterService: CharacterService
  private readonly gameSessionService: GameSessionService

  constructor(
    private readonly ctx: Context,
    private readonly adapter: DiceAdapter
  ) {
    this.pluginDir = path.join(ctx.baseDir, 'data', 'koidice', 'plugins')
    this.characterService = new CharacterService(ctx, adapter)
    this.gameSessionService = new GameSessionService(ctx)
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Extension System')
    await fs.mkdir(this.pluginDir, { recursive: true })
    logger.info(`Plugin directory: ${this.pluginDir}`)

    const discovered = await this.discoverPlugins()
    const ordered = this.resolveLoadOrder(discovered)
    logger.info(`Found ${discovered.size} valid plugin descriptor(s)`)

    for (const plugin of ordered) {
      if (
        plugin.descriptor.require?.some(
          (dependency) => !this.loadedPlugins.has(dependency)
        )
      ) {
        logger.error(
          `Skipping plugin ${plugin.descriptor.name}: a dependency failed to load`
        )
        continue
      }
      await this.loadPlugin(plugin.path, plugin.descriptor)
    }

    logger.info(`Successfully loaded ${this.loadedPlugins.size} plugin(s)`)
    logger.info('Extension System Ready')
  }

  private async discoverPlugins(): Promise<Map<string, DiscoveredPlugin>> {
    const plugins = new Map<string, DiscoveredPlugin>()
    const entries = (await fs.readdir(this.pluginDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const pluginPath = path.join(this.pluginDir, entry.name)
      try {
        const descriptor = await this.readDescriptor(pluginPath)
        if (plugins.has(descriptor.name)) {
          throw new Error(`duplicate plugin name "${descriptor.name}"`)
        }
        plugins.set(descriptor.name, { path: pluginPath, descriptor })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Invalid plugin ${entry.name}: ${message}`)
      }
    }

    return plugins
  }

  private async readDescriptor(pluginPath: string): Promise<DescriptorJson> {
    const descriptorPath = path.join(pluginPath, 'descriptor.json')
    const value: unknown = JSON.parse(await fs.readFile(descriptorPath, 'utf-8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('descriptor.json must contain an object')
    }

    const descriptor = value as Record<string, unknown>
    if (typeof descriptor.name !== 'string' || !descriptor.name.trim()) {
      throw new Error('descriptor field "name" must be a non-empty string')
    }
    if (typeof descriptor.ver !== 'string' || !descriptor.ver.trim()) {
      throw new Error('descriptor field "ver" must be a non-empty string')
    }
    if (
      descriptor.require !== undefined &&
      (!Array.isArray(descriptor.require) ||
        descriptor.require.some(
          (dependency) => typeof dependency !== 'string' || !dependency
        ))
    ) {
      throw new Error('descriptor field "require" must be an array of strings')
    }
    if (
      descriptor.dice_build !== undefined &&
      (typeof descriptor.dice_build !== 'number' ||
        !Number.isInteger(descriptor.dice_build) ||
        descriptor.dice_build < 0)
    ) {
      throw new Error('descriptor field "dice_build" must be a non-negative integer')
    }
    if (
      typeof descriptor.dice_build === 'number' &&
      descriptor.dice_build > SUPPORTED_DICE_BUILD
    ) {
      throw new Error(
        `requires Dice build ${descriptor.dice_build}, supported build is ${SUPPORTED_DICE_BUILD}`
      )
    }

    return value as DescriptorJson
  }

  private resolveLoadOrder(
    plugins: Map<string, DiscoveredPlugin>
  ): DiscoveredPlugin[] {
    const valid = new Map(plugins)
    for (const [name, plugin] of plugins) {
      const missing = plugin.descriptor.require?.filter(
        (dependency) => !plugins.has(dependency)
      )
      if (missing?.length) {
        logger.error(
          `Invalid plugin ${name}: missing dependencies ${missing.sort().join(', ')}`
        )
        valid.delete(name)
      }
    }

    let changed = true
    while (changed) {
      changed = false
      for (const [name, plugin] of valid) {
        const unavailable = plugin.descriptor.require?.find(
          (dependency) => !valid.has(dependency)
        )
        if (unavailable) {
          logger.error(
            `Invalid plugin ${name}: dependency ${unavailable} is unavailable`
          )
          valid.delete(name)
          changed = true
        }
      }
    }

    const result: DiscoveredPlugin[] = []
    const remaining = new Set(valid.keys())
    while (remaining.size) {
      const ready = [...remaining]
        .filter((name) =>
          (valid.get(name)?.descriptor.require ?? []).every(
            (dependency) => !remaining.has(dependency)
          )
        )
        .sort()
      if (!ready.length) {
        logger.error(
          `Invalid plugin dependency cycle: ${[...remaining].sort().join(', ')}`
        )
        break
      }
      for (const name of ready) {
        result.push(valid.get(name)!)
        remaining.delete(name)
      }
    }
    return result
  }

  async loadPlugin(
    pluginPath: string,
    preparedDescriptor?: DescriptorJson
  ): Promise<boolean> {
    let descriptor: DescriptorJson
    try {
      descriptor = preparedDescriptor ?? (await this.readDescriptor(pluginPath))
      if (this.loadedPlugins.has(descriptor.name)) {
        throw new Error(`plugin "${descriptor.name}" is already loaded`)
      }
      const missing = descriptor.require?.filter(
        (dependency) => !this.loadedPlugins.has(dependency)
      )
      if (missing?.length) {
        throw new Error(`missing loaded dependencies ${missing.join(', ')}`)
      }
    } catch (error) {
      logger.error(`Failed to load plugin from ${path.basename(pluginPath)}:`, error)
      return false
    }

    const scripts = new Map<string, string>()
    const commands = new Map<string, ReplyConfig>()
    const scriptNames = new Set<string>()
    const templateKeys = new Set<string>()
    const ruleKeys = new Set<string>()
    const disposers: Array<() => void> = []
    const plugin: LoadedPlugin = {
      name: descriptor.name,
      path: pluginPath,
      descriptor,
      scripts,
      commands,
      scriptNames,
      disposers,
      templateKeys,
      ruleKeys
    }

    try {
      const scriptDir = path.join(pluginPath, 'script')
      try {
        await this.loadScriptsRecursive(
          scriptDir,
          scriptDir,
          descriptor.name,
          scripts
        )
      } catch (error) {
        if (!this.isMissingFile(error)) throw error
      }
      await this.registerScripts(plugin)
      await this.loadTemplates(plugin)
      await this.loadRules(plugin)

      try {
        await this.loadReplyConfigs(path.join(pluginPath, 'reply'), commands)
      } catch (error) {
        if (!this.isMissingFile(error)) throw error
      }
      disposers.push(
        ...(await registerPluginCommands(
          this.ctx,
          this.adapter,
          descriptor,
          commands,
          this.characterService,
          this.gameSessionService,
          this.pluginRules,
          this.templateAliasMap
        ))
      )

      this.loadedPlugins.set(descriptor.name, plugin)
      logger.info(`Plugin loaded: ${descriptor.name}`)
      return true
    } catch (error) {
      logger.error(`Failed to load plugin ${descriptor.name}:`, error)
      this.releasePlugin(plugin)
      return false
    }
  }

  private async registerScripts(plugin: LoadedPlugin): Promise<void> {
    for (const [scriptName, code] of plugin.scripts) {
      const isLua = scriptName.endsWith('.lua')
      const fullName = scriptName.replace(/\.(lua|js)$/, '')
      const names = [fullName]
      if (fullName.startsWith(`${plugin.name}.`)) {
        names.push(fullName.slice(plugin.name.length + 1))
      }
      for (const name of names) {
        const owner = this.scriptOwners.get(name)
        if (owner) {
          throw new Error(`script name "${name}" is already owned by ${owner}`)
        }
      }

      const processedCode = isLua
        ? wrapLuaScript(code, plugin.descriptor)
        : code
      for (const name of names) {
        const success = isLua
          ? this.adapter.loadLuaExtension(name, processedCode, code)
          : this.adapter.loadJSExtension(name, code)
        if (!success) throw new Error(`native script registration failed: ${name}`)
        plugin.scriptNames.add(name)
        this.scriptOwners.set(name, plugin.name)
      }
    }
  }

  private async loadTemplates(plugin: LoadedPlugin): Promise<void> {
    const modelDir = path.join(plugin.path, 'model')
    let files: string[]
    try {
      files = (await fs.readdir(modelDir)).filter((file) => file.endsWith('.xml')).sort()
    } catch (error) {
      if (this.isMissingFile(error)) return
      throw error
    }

    for (const file of files) {
      const template = parseTemplate(
        await fs.readFile(path.join(modelDir, file), 'utf-8')
      )
      if (!template) continue
      const owner = this.templateOwners.get(template.name)
      if (owner) {
        throw new Error(`template "${template.name}" is already owned by ${owner}`)
      }
      this.pluginTemplates.set(template.name, template)
      this.templateAliasMap.set(template.name, createAliasMap(template))
      this.templateOwners.set(template.name, plugin.name)
      plugin.templateKeys.add(template.name)
    }
  }

  private async loadRules(plugin: LoadedPlugin): Promise<void> {
    const rules = new Map<string, Rulebook>()
    try {
      await loadRulebooks(
        path.join(plugin.path, 'rulebook'),
        plugin.name,
        rules
      )
    } catch (error) {
      if (this.isMissingFile(error)) return
      throw error
    }

    for (const [key, rule] of rules) {
      const owner = this.ruleOwners.get(key)
      if (owner) throw new Error(`rule "${key}" is already owned by ${owner}`)
      this.pluginRules.set(key, rule)
      this.ruleOwners.set(key, plugin.name)
      plugin.ruleKeys.add(key)
    }
  }

  private async loadScriptsRecursive(
    dir: string,
    scriptRoot: string,
    baseName: string,
    scripts: Map<string, string>
  ): Promise<void> {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name)
    )
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await this.loadScriptsRecursive(fullPath, scriptRoot, baseName, scripts)
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.lua') || entry.name.endsWith('.js'))
      ) {
        const relativePath = path.relative(scriptRoot, fullPath)
        const scriptName = `${baseName}.${relativePath.replace(/[/\\]/g, '.')}`
        scripts.set(scriptName, await fs.readFile(fullPath, 'utf-8'))
      }
    }
  }

  private async loadReplyConfigs(
    replyDir: string,
    commands: Map<string, ReplyConfig>
  ): Promise<void> {
    const files = (await fs.readdir(replyDir))
      .filter((file) => file.endsWith('.toml'))
      .sort()
    for (const file of files) {
      const config = toml.parse(
        await fs.readFile(path.join(replyDir, file), 'utf-8')
      ) as Record<string, unknown>
      const replies = config.reply
      if (!replies || typeof replies !== 'object' || Array.isArray(replies)) {
        continue
      }
      for (const commandName of Object.keys(replies).sort()) {
        commands.set(
          commandName,
          (replies as Record<string, ReplyConfig>)[commandName]
        )
      }
    }
  }

  listPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values())
  }

  getPlugin(name: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(name)
  }

  queryPluginRule(ruleName: string, keyword: string): string | undefined {
    return this.pluginRules.get(ruleName)?.[keyword]
  }

  listPluginRules(): string[] {
    return Array.from(this.pluginRules.keys())
  }

  getTemplate(templateName: string): CharacterTemplate | undefined {
    return this.pluginTemplates.get(templateName)
  }

  listTemplates(): string[] {
    return Array.from(this.pluginTemplates.keys())
  }

  getAliasMap(templateName: string): Record<string, string> | undefined {
    return this.templateAliasMap.get(templateName)
  }

  inspectNativeExtensions(): string {
    return this.adapter.listExtensions()
  }

  unloadPlugin(name: string): boolean {
    const plugin = this.loadedPlugins.get(name)
    if (!plugin) return false
    const dependents = [...this.loadedPlugins.values()]
      .filter((candidate) => candidate.descriptor.require?.includes(name))
      .map((candidate) => candidate.name)
    if (dependents.length) {
      logger.warn(
        `Cannot unload plugin ${name}; required by ${dependents.sort().join(', ')}`
      )
      return false
    }
    this.releasePlugin(plugin)
    this.loadedPlugins.delete(name)
    return true
  }

  private releasePlugin(plugin: LoadedPlugin): void {
    for (const dispose of [...plugin.disposers].reverse()) {
      try {
        dispose()
      } catch (error) {
        logger.warn(`Failed to dispose registration for ${plugin.name}:`, error)
      }
    }
    plugin.disposers.length = 0

    for (const name of plugin.scriptNames) {
      if (this.scriptOwners.get(name) === plugin.name) {
        try {
          this.adapter.unloadExtension(name)
        } catch (error) {
          logger.warn(`Failed to unload native script ${name}:`, error)
        }
        this.scriptOwners.delete(name)
      }
    }
    plugin.scriptNames.clear()

    for (const key of plugin.templateKeys) {
      if (this.templateOwners.get(key) === plugin.name) {
        this.pluginTemplates.delete(key)
        this.templateAliasMap.delete(key)
        this.templateOwners.delete(key)
      }
    }
    plugin.templateKeys.clear()

    for (const key of plugin.ruleKeys) {
      if (this.ruleOwners.get(key) === plugin.name) {
        this.pluginRules.delete(key)
        this.ruleOwners.delete(key)
      }
    }
    plugin.ruleKeys.clear()
  }

  async reloadPlugin(name: string): Promise<boolean> {
    const plugin = this.loadedPlugins.get(name)
    if (!plugin) return false
    const pluginPath = plugin.path
    this.releasePlugin(plugin)
    this.loadedPlugins.delete(name)
    if (await this.loadPlugin(pluginPath)) return true
    logger.error(`Reload failed for ${name}; restoring previous plugin contents`)
    return this.restorePlugin(plugin)
  }

  private async restorePlugin(plugin: LoadedPlugin): Promise<boolean> {
    try {
      await this.registerScripts(plugin)
      await this.loadTemplates(plugin)
      await this.loadRules(plugin)
      plugin.disposers.push(
        ...(await registerPluginCommands(
          this.ctx, this.adapter, plugin.descriptor, plugin.commands,
          this.characterService, this.gameSessionService,
          this.pluginRules, this.templateAliasMap
        ))
      )
      this.loadedPlugins.set(plugin.name, plugin)
      return true
    } catch (error) {
      logger.error(`Failed to restore plugin ${plugin.name}:`, error)
      this.releasePlugin(plugin)
      return false
    }
  }

  dispose(): void {
    const remaining = new Set(this.loadedPlugins.keys())
    while (remaining.size) {
      const unloadable = [...remaining]
        .filter(
          (name) =>
            ![...remaining].some((candidate) =>
              this.loadedPlugins
                .get(candidate)
                ?.descriptor.require?.includes(name)
            )
        )
        .sort()
      if (!unloadable.length) {
        for (const name of remaining) {
          const plugin = this.loadedPlugins.get(name)
          if (plugin) this.releasePlugin(plugin)
          this.loadedPlugins.delete(name)
        }
        break
      }
      for (const name of unloadable) {
        this.unloadPlugin(name)
        remaining.delete(name)
      }
    }
  }

  private isMissingFile(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
  }

}
