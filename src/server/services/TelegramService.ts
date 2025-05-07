import { PrismaClient } from '@prisma/client';

export class TelegramService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Sends a message to a Telegram user via bot
   * @param chatId The Telegram chat ID to send the message to
   * @param message The message text to send
   * @returns The response from the Telegram API
   */
  public async sendMessage(chatId: string, message: string): Promise<any> {
    try {
      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
      
      if (!telegramBotToken) {
        throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
      }
      
      const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
      
      const payload = {
        chat_id: chatId,
        text: message
      };
      
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`);
      }
      
      return result;
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      throw error;
    }
  }
}