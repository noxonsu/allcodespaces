const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables from .env file
const result = dotenv.config();
if (result.error) {
    throw result.error;
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not defined in .env file');
}

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not defined in .env file');
}

const bot = new TelegramBot(token, { polling: true });

const conversations = {};

const systemMessage = {
  role: 'system',
  content: [
    { type: 'input_text', text: 'Ты ассистент для поиска, сначала спроси имя человека потом спроси что он хочет узнать. При ответе обращайся по имени' }
  ]
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log('Received /start command from chat ID:', chatId);
  bot.sendMessage(chatId, 'Как вас зовут?')
    .then(() => console.log('Start message sent successfully'))
    .catch(error => console.error('Error sending start message:', error));
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  // Игнорируем команду /start в обработке сообщений
  if (userText === '/start') return;

  if (!conversations[chatId]) {
    conversations[chatId] = [systemMessage];
  }

  const userMessage = {
    role: 'user',
    content: [{ type: 'input_text', text: userText }]
  };
  conversations[chatId].push(userMessage);

  const payload = {
    model: 'gpt-4o',
    input: conversations[chatId],
    text: { format: { type: 'text' } },
    reasoning: {},
    tools: [
      {
        type: 'web_search_preview',
        user_location: { type: 'approximate', country: 'RU' },
        search_context_size: 'medium'
      }
    ],
    temperature: 1,
    max_output_tokens: 2048,
    top_p: 1,
    store: true
  };

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/responses',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        }
      }
    );

    console.log('API Response:', JSON.stringify(response.data, null, 2));

    if (!response.data || !response.data.output) {
      throw new Error('Unexpected API response structure');
    }

    // Find the message output in the response
    const messageOutput = response.data.output.find(
      output => output.type === 'message'
    );

    if (!messageOutput || !messageOutput.content) {
      throw new Error('No message content found in response');
    }

    const assistantText = messageOutput.content[0]?.text;

    if (!assistantText) {
      throw new Error('No text content in response');
    }

    await bot.sendMessage(chatId, assistantText);

    conversations[chatId].push({
      role: 'assistant',
      content: messageOutput.content
    });
  } catch (error) {
    console.error('Error details:', error);
    bot.sendMessage(chatId, 'Извините, произошла ошибка при обработке вашего запроса.');
  }
});