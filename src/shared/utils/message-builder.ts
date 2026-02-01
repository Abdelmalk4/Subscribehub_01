import { escapeHtml, withFooter } from './index.js';

/**
 * Standardized Message Builder for SubscribeHub
 * Enforces consistent UI/UX across all bots
 */
export class MessageBuilder {
  private parts: string[] = [];

  /**
   * Start a new message
   */
  constructor() {}

  /**
   * Add a header with emoji and bold text
   * @param emoji The emoji to display
   * @param title The title text (will be bolded)
   */
  header(emoji: string, title: string): this {
    this.parts.push(`${emoji} <b>${escapeHtml(title)}</b>\n`);
    return this;
  }

  /**
   * Add a generic line of text
   * @param text The text to add
   */
  line(text: string = ''): this {
    this.parts.push(escapeHtml(text));
    return this;
  }

  /**
   * Add a raw HTML line (use carefully!)
   * @param html The HTML string to add
   */
  raw(html: string): this {
    this.parts.push(html);
    return this;
  }

  /**
   * Add an empty line for spacing
   */
  break(): this {
    this.parts.push('');
    return this;
  }

  /**
   * Add a key-value pair
   * @param key The label
   * @param value The value
   */
  field(key: string, value: string): this {
    this.parts.push(`<b>${escapeHtml(key)}:</b> ${escapeHtml(value)}`);
    return this;
  }

  /**
   * Add a list of items
   * @param items Array of strings to list
   * @param bullet Bullet character (default: •)
   */
  list(items: string[], bullet: string = '•'): this {
    for (const item of items) {
      this.parts.push(`${bullet} ${escapeHtml(item)}`);
    }
    return this;
  }

  /**
   * Add an info block (italicized)
   * @param text The info text
   */
  info(text: string): this {
    this.parts.push(`<i>${escapeHtml(text)}</i>`);
    return this;
  }

  /**
   * Build the final message string with standard footer
   */
  toString(): string {
    const message = this.parts.join('\n');
    return withFooter(message);
  }
}
