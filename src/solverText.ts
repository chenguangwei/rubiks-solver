export type Translate = (key: string, values?: Record<string, string | number>) => string

type MessageValue = string | number | { key: string }

export type SolverMessage =
  | { kind: 'i18n'; key: string; values?: Record<string, MessageValue> }
  | { kind: 'raw'; text: string }

export function msg(key: string, values?: Record<string, MessageValue>): SolverMessage {
  return { kind: 'i18n', key, values }
}

export function rawMsg(text: string): SolverMessage {
  return { kind: 'raw', text }
}

export function msgKey(key: string): { key: string } {
  return { key }
}

export function translateMessage(message: SolverMessage, t: Translate): string {
  if (message.kind === 'raw') return message.text
  const values = Object.fromEntries(
    Object.entries(message.values ?? {}).map(([key, value]) => [
      key,
      typeof value === 'object' && value !== null && 'key' in value ? t(value.key) : value,
    ]),
  ) as Record<string, string | number>
  return t(message.key, values)
}
