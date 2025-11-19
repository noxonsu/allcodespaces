const fs = require("fs").promises;
const path = require("path");
const OpenAI = require("openai");
const dotenv = require("dotenv");
const TelegramBot = require("node-telegram-bot-api");

const result = dotenv.config();
if (result.error) {
  console.error(`Ошибка загрузки файла .env`, result.error);
  process.exit(1);
}

// Инициализация OpenAI с вашим API-ключом
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Инициализация Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Telegram Bot Token не найден в .env файле. Пожалуйста, добавьте TELEGRAM_BOT_TOKEN.");
  process.exit(1);
}
const bot = new TelegramBot(token);
const CHAT_ID = "-1002839026142"; // Указанный ID чата

// Константы
const CHARS_PER_MINUTE = 900; // Скорость чтения
const MAX_MINUTES = 5; // Максимальная длительность фрагмента
const MAX_CHARS = CHARS_PER_MINUTE * MAX_MINUTES; // 27,000 символов
const inputFile = path.resolve("./bitie-i-nihto.txt");
const outputDir = path.resolve("./output_audio");
const textChunksDir = path.resolve("./text_chunks");
const summariesDir = path.resolve("./summaries");

// Функция для создания директорий, если они не существуют
async function ensureDirs() {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(textChunksDir, { recursive: true });
    await fs.mkdir(summariesDir, { recursive: true });
  } catch (error) {
    console.error("Ошибка при создании директорий:", error.message);
    process.exit(1);
  }
}

// Функция для разделения текста на части
function splitText(text) {
  const chunks = [];
  let currentChunk = "";
  let currentLength = 0;

  // Разделяем текст на абзацы или предложения
  const paragraphs = text.split(/\n|\. /);

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;

    // Добавляем точку обратно, если это предложение
    const segment = para.endsWith(".") ? para : `${para}. `;
    const segmentLength = segment.length;

    if (currentLength + segmentLength > MAX_CHARS) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
        currentLength = 0;
      }
    }

    currentChunk += segment;
    currentLength += segmentLength;

    // Если это последний сегмент, добавляем его в chunks
    if (i === paragraphs.length - 1 && currentChunk) {
      chunks.push(currentChunk.trim());
    }
  }

  return chunks;
}

// Функция для сохранения текстовых фрагментов
async function saveTextChunks(chunks, originalFileName) {
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunkFile = path.resolve(textChunksDir, `${originalFileName}_chunk_${i + 1}.txt`);
      await fs.writeFile(chunkFile, chunks[i]);
      console.log(`Текстовый фрагмент сохранен: ${chunkFile}`);
    }
  } catch (error) {
    console.error("Ошибка при сохранении текстовых фрагментов:", error.message);
    throw error;
  }
}

// Функция для загрузки существующих текстовых фрагментов
async function loadTextChunks(originalFileName) {
  try {
    const files = await fs.readdir(textChunksDir);
    const chunkFiles = files
      .filter((file) => file.startsWith(`${originalFileName}_chunk_`) && file.endsWith(".txt"))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/\d+/)[0]);
        const bNum = parseInt(b.match(/\d+/)[0]);
        return aNum - bNum;
      });

    const chunks = [];
    for (const file of chunkFiles) {
      const content = await fs.readFile(path.resolve(textChunksDir, file), "utf8");
      chunks.push(content);
    }
    return chunks;
  } catch (error) {
    console.error("Ошибка при загрузке текстовых фрагментов:", error.message);
    return [];
  }
}

// Функция для создания аудиофайла из текста
async function createAudioChunk(text, index) {
  const originalFileName = path.basename(inputFile, path.extname(inputFile));
  const speechFile = path.resolve(outputDir, `${originalFileName}_part_${index + 1}.mp3`);
  try {
    // Проверяем, существует ли аудиофайл
    try {
      await fs.access(speechFile);
      console.log(`Аудиофайл уже существует, пропускаем: ${speechFile}`);
      return false; // Возвращаем false, если файл уже существует
    } catch {
      // Файл не существует, создаем его
    }

    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: text,
      instructions: "Это учебник по психологии.",
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.writeFile(speechFile, buffer);
    console.log(`Аудиофайл успешно сохранен: ${speechFile}`);
    return true; // Возвращаем true, если файл был создан
  } catch (error) {
    console.error(`Ошибка при создании аудиофайла ${speechFile}:`, error.message);
    return false;
  }
}

// Функция для создания краткого описания текста
async function createSummary(text, index) {
  const originalFileName = path.basename(inputFile, path.extname(inputFile));
  const summaryFile = path.resolve(summariesDir, `${originalFileName}_summary_${index + 1}.txt`);

  try {
    // Проверяем, существует ли уже краткое описание
    try {
      const existingSummary = await fs.readFile(summaryFile, "utf8");
      console.log(`Краткое описание уже существует для части ${index + 1}`);
      return existingSummary.trim();
    } catch {
      // Файл не существует, создаем краткое описание
    }

    console.log(`Создание краткого описания для части ${index + 1}...`);

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Ты создаешь краткие описания в одном предложении. Только суть, без вводных слов."
        },
        {
          role: "user",
          content: `Опиши суть текста в 1 предложении:\n\n${text.substring(0, 1000)}`
        }
      ],
      max_tokens: 40,
      temperature: 0.3
    });

    const summary = response.choices[0].message.content.trim();

    // Сохраняем краткое описание в файл
    await fs.writeFile(summaryFile, summary);
    console.log(`Краткое описание сохранено: ${summaryFile}`);

    return summary;
  } catch (error) {
    console.error(`Ошибка при создании краткого описания для части ${index + 1}:`, error.message);
    return `Аудио-фрагмент ${index + 1}`;
  }
}

// Функция для загрузки существующего краткого описания
async function loadSummary(originalFileName, index) {
  try {
    const summaryFile = path.resolve(summariesDir, `${originalFileName}_summary_${index + 1}.txt`);
    const summary = await fs.readFile(summaryFile, "utf8");
    return summary.trim();
  } catch (error) {
    return null;
  }
}

// Функция для отправки аудио в Telegram
async function sendAudioToTelegram(filePath, caption, text) {
  try {
    const fullCaption = `${caption} - ${text}`;

    await bot.sendAudio(CHAT_ID, filePath, { caption: fullCaption });
    console.log(`Аудиофайл "${path.basename(filePath)}" успешно отправлен в Telegram с описанием.`);
    return true;
  } catch (error) {
    console.error(`Ошибка при отправке аудиофайла "${path.basename(filePath)}" в Telegram:`, error.message);
    return false;
  }
}

// Основная функция
async function textToSpeech() {
  try {
    // Создаем директории
    await ensureDirs();

    // Получаем имя файла для использования в именах аудиофайлов
    const originalFileName = path.basename(inputFile, path.extname(inputFile));

    // Проверяем, существуют ли текстовые фрагменты
    let textChunks = await loadTextChunks(originalFileName);
    if (textChunks.length > 0) {
      console.log(`Найдено ${textChunks.length} существующих текстовых фрагментов.`);
    } else {
      // Чтение текста из файла
      const inputText = await fs.readFile(inputFile, "utf8");
      if (!inputText.trim()) {
        console.error("Входной файл пуст.");
        return;
      }

      // Разделение текста на части
      textChunks = splitText(inputText);
      console.log(`Текст разделен на ${textChunks.length} частей.`);

      // Сохранение текстовых фрагментов
      await saveTextChunks(textChunks, originalFileName);
    }

    // Создание аудиофайлов для каждой части
    let successCount = 0;
    let sentCount = 0;

    for (let i = 0; i < Math.min(20, textChunks.length); i++) {
      console.log(`Обработка части ${i + 1} (${textChunks[i].length} символов)...`);

      // Создаем аудиофайл (возвращает true только если файл был создан заново)
      const audioCreated = await createAudioChunk(textChunks[i], i);

      // Увеличиваем счетчик успешно обработанных файлов
      const speechFile = path.resolve(outputDir, `${originalFileName}_part_${i + 1}.mp3`);
      try {
        await fs.access(speechFile);
        successCount++; // Файл существует
      } catch {
        // Файл не существует, что-то пошло не так
      }

      // Отправляем в Telegram только если файл был создан заново
      if (audioCreated) {
        // Создаем или загружаем краткое описание
        let summary = await loadSummary(originalFileName, i);
        if (!summary) {
          summary = await createSummary(textChunks[i], i);
        }

        // Отправляем аудио в Telegram с кратким описанием
        const sent = await sendAudioToTelegram(
          speechFile,
          `${i + 1}/${textChunks.length}`,
          summary
        );

        if (sent) {
          sentCount++;
        }
      }
    }

    console.log(
      `Обработка завершена: ${successCount} из ${textChunks.length} аудиофайлов доступны. ${sentCount} новых файлов отправлено в Telegram.`
    );
  } catch (error) {
    console.error("Ошибка при обработке:", error.message);
  }
}

// Вызов функции
textToSpeech();
