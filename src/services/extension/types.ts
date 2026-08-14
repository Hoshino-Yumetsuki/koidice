export type ReplyType = 'Nor' | 'Order' | 'Reply' | 'Both' | 'Game'
export type ReplyMatchMode = 'match' | 'prefix' | 'search' | 'regex'

export interface DescriptorJson {
  name: string
  title?: string
  ver: string
  author?: string
  brief?: string
  desc?: string
  dice_build?: number
  require?: string[]
  repo?: string
  comment?: string
}

export interface ReplyKeyword {
  match?: string | string[]
  prefix?: string | string[]
  search?: string | string[]
  regex?: string | string[]
  Match?: string | string[]
  Prefix?: string | string[]
  Search?: string | string[]
  Regex?: string | string[]
}

export interface ReplyEcho {
  text?: string
  deck?: string[]
  lua?: string
  js?: string
}

export interface ReplyIdLimit {
  only?: string | string[]
  not?: string | string[]
  nor?: string | number | Array<string | number>
}

export interface ReplyLimit {
  user_id?: ReplyIdLimit | string | string[]
  grp_id?: ReplyIdLimit | string | string[]
  prob?: number
}

export interface ReplyConfig {
  type?: ReplyType | Lowercase<ReplyType>
  rule?: string
  keyword?: ReplyKeyword
  echo?: string | string[] | ReplyEcho
  limit?: ReplyLimit
}

export interface LoadedPlugin {
  name: string
  path: string
  descriptor: DescriptorJson
  scripts: Map<string, string>
  commands: Map<string, ReplyConfig>
  scriptNames: Set<string>
  disposers: Array<() => void>
  templateKeys: Set<string>
  ruleKeys: Set<string>
}

export interface ExtensionContext {
  suffix: string
  uid: string
  gid: string
  private: boolean
  char?: Record<string, unknown>
  card: string
  game: Record<string, unknown>
  pluginRules: Record<string, unknown>
  templateAliasMap: Record<string, Record<string, string>>
}
