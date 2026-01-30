/**
 * Runtime State
 * Stores dynamic configuration values determined at runtime
 */

let mainBotUsername: string | null = null;

export function setMainBotUsername(username: string) {
  mainBotUsername = username;
}

export function getMainBotUsername(): string {
  // Return stored username or fallback to default if not yet set
  return mainBotUsername || 'TeleTradeBot';
}
