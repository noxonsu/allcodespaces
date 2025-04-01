// __tests__/telegramBot.test.js
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { processVoice, processPhoto } = require('../allCodeSpacesImageparse'); // Замените на путь к вашему основному файлу
const { sanitizeString, validateChatId, logChat, validateImageResponse, validateMimeTypeImg, validateMimeTypeAudio } = require('../utilities');
const { callOpenAI, clearConversation, transcribeAudio } = require('../openai');

// Мокируем модули
jest.mock('node-telegram-bot-api');
jest.mock('axios');
jest.mock('fs');
jest.mock('../utilities');
jest.mock('../openai');

describe('Telegram Bot allCodeSpacesImageparse.js Tests', () => {
  let bot;

  beforeEach(() => {
    bot = new TelegramBot.mock.instances[0];
    jest.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = 'mock-token';
    process.env.OPENAI_API_KEY = 'mock-openai-key';
  });

  // Тесты для processVoice
  describe('processVoice', () => {
    const mockMsg = {
      chat: { id: 123 },
      voice: { file_id: 'voice123', mime_type: 'audio/ogg' },
      caption: 'Test caption',
    };

    it('should process voice message successfully', async () => {
      validateChatId.mockReturnValue(true);
      sanitizeString.mockImplementation(str => str);
      bot.getFile.mockResolvedValue({ file_path: 'file.ogg' });
      validateMimeTypeAudio.mockReturnValue(true);
      transcribeAudio.mockResolvedValue('Transcribed text');

      const result = await processVoice(mockMsg);

      expect(result).toEqual([
        { type: 'input_text', text: 'Test caption' },
        { type: 'input_text', text: 'Transcribed text' },
      ]);
      expect(logChat).toHaveBeenCalledWith(123, expect.objectContaining({ type: 'voice' }));
    });

    it('should throw error on invalid chat ID', async () => {
      validateChatId.mockReturnValue(false);
      await expect(processVoice(mockMsg)).rejects.toThrow('Invalid chat ID');
    });

    it('should throw error on invalid voice data', async () => {
      validateChatId.mockReturnValue(true);
      const invalidMsg = { chat: { id: 123 }, voice: {} };
      await expect(processVoice(invalidMsg)).rejects.toThrow('Invalid voice data');
    });
  });

  // Тесты для processPhoto
  describe('processPhoto', () => {
    const mockMsg = {
      chat: { id: 123 },
      photo: [{ file_id: 'photo123' }],
      caption: 'Photo caption',
    };

    it('should process photo message successfully', async () => {
      validateChatId.mockReturnValue(true);
      sanitizeString.mockImplementation(str => str);
      bot.getFile.mockResolvedValue({ file_path: 'image.jpg' });
      validateMimeTypeImg.mockReturnValue(true);
      axios.get.mockResolvedValue({ data: Buffer.from('mock-image') });
      validateImageResponse.mockReturnValue(true);

      const result = await processPhoto(mockMsg);

      expect(result).toContainEqual({ type: 'input_text', text: 'Photo caption' });
      expect(result).toContainEqual(expect.objectContaining({ type: 'input_image', image_url: expect.any(String) }));
      expect(logChat).toHaveBeenCalledWith(123, expect.objectContaining({ type: 'photo' }));
    });

    it('should throw error on invalid file type', async () => {
      validateChatId.mockReturnValue(true);
      bot.getFile.mockResolvedValue({ file_path: 'image.xyz' });
      validateMimeTypeImg.mockReturnValue(false);

      await expect(processPhoto(mockMsg)).rejects.toThrow('Invalid file type');
    });
  });

  // Тесты для команды /start
  describe('/start command', () => {
    it('should handle /start command and ask for name', async () => {
      const msg = { chat: { id: 123 }, from: { username: 'testuser' } };
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      await bot.onText.mock.calls[0][1](msg, ['']);

      expect(bot.sendMessage).toHaveBeenCalledWith(123, 'Как вас зовут?');
      expect(clearConversation).toHaveBeenCalledWith(123);
    });
  });

  // Тесты для обработки текстовых сообщений
  describe('text message handler', () => {
    it('should process first message as name', async () => {
      const msg = { chat: { id: 123 }, text: 'Alice' };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('[{"type": "system"}]');
      callOpenAI.mockResolvedValue('Привет, Alice!');

      await bot.on.mock.calls.find(call => call[0] === 'message')[1](msg);

      expect(logChat).toHaveBeenCalledWith(123, expect.objectContaining({ type: 'name_provided', name: 'Alice' }));
      expect(bot.sendMessage).toHaveBeenCalledWith(123, 'Привет, Alice!');
    });

    it('should handle regular message after name is provided', async () => {
      const msg = { chat: { id: 123 }, text: 'How are you?' };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('[{"type": "name_provided"}]');
      fs.statSync.mockReturnValue({ mtime: new Date() });
      callOpenAI.mockResolvedValue('I’m fine, thanks!');

      await bot.on.mock.calls.find(call => call[0] === 'message')[1](msg);

      expect(bot.sendMessage).toHaveBeenCalledWith(123, 'I’m fine, thanks!');
    });
  });

  // Тесты для обработки ошибок
  describe('error handling', () => {
    it('should handle polling errors', () => {
      const error = { code: 'ECONNRESET', message: 'Connection reset' };
      bot.on.mock.calls.find(call => call[0] === 'polling_error')[1](error);
      expect(console.error).toHaveBeenCalledWith('Polling error:', 'ECONNRESET', '-', 'Connection reset');
    });
  });
});

// Моки для зависимостей
beforeAll(() => {
  TelegramBot.mockImplementation(() => ({
    getFile: jest.fn(),
    sendMessage: jest.fn(),
    on: jest.fn(),
    onText: jest.fn(),
  }));
  axios.get.mockResolvedValue({ data: Buffer.from('mock-data') });
  fs.existsSync.mockReturnValue(true);
  fs.readFileSync.mockReturnValue('');
  fs.writeFileSync.mockImplementation(() => {});
  fs.statSync.mockReturnValue({ mtime: new Date() });
  console.error = jest.fn();
  console.log = jest.fn();
});