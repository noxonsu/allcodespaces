const fs = require("fs").promises;
const path = require("path");
const OpenAI = require("openai");
const dotenv = require("dotenv");

const result = dotenv.config();
if (result.error) {
  console.error(`Ошибка загрузки файла .env`, result.error);
  process.exit(1);
}

// Инициализация OpenAI с вашим API-ключом
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Константы
const CHARS_PER_MINUTE = 900; // Скорость чтения
const MAX_MINUTES = 5; // Максимальная длительность фрагмента
const MAX_CHARS = CHARS_PER_MINUTE * MAX_MINUTES; // 27,000 символов
const inputFile = path.resolve("./from.txt");
const outputDir = path.resolve("./output_audio");
const textChunksDir = path.resolve("./text_chunks");

// Функция для создания директорий, если они не существуют
async function ensureDirs() {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(textChunksDir, { recursive: true });
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
async function saveTextChunks(chunks) {
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunkFile = path.resolve(textChunksDir, `chunk_${i + 1}.txt`);
      await fs.writeFile(chunkFile, chunks[i]);
      console.log(`Текстовый фрагмент сохранен: ${chunkFile}`);
    }
  } catch (error) {
    console.error("Ошибка при сохранении текстовых фрагментов:", error.message);
    throw error;
  }
}

// Функция для загрузки существующих текстовых фрагментов
async function loadTextChunks() {
  try {
    const files = await fs.readdir(textChunksDir);
    const chunkFiles = files
      .filter((file) => file.startsWith("chunk_") && file.endsWith(".txt"))
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
  const speechFile = path.resolve(outputDir, `godfrua_part_${index + 1}.mp3`);
  try {
    // Проверяем, существует ли аудиофайл
    try {
      await fs.access(speechFile);
      console.log(`Аудиофайл уже существует, пропускаем: ${speechFile}`);
      return true;
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
    return true;
  } catch (error) {
    console.error(`Ошибка при создании аудиофайла ${speechFile}:`, error.message);
    return false;
  }
}

// Основная функция
async function textToSpeech() {
  try {
    // Создаем директории
    await ensureDirs();

    // Проверяем, существуют ли текстовые фрагменты
    let textChunks = await loadTextChunks();
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
      await saveTextChunks(textChunks);
    }

    // Создание аудиофайлов для каждой части
    let successCount = 0;
    for (let i = 0; i < textChunks.length; i++) {
      console.log(`Обработка части ${i + 1} (${textChunks[i].length} символов)...`);
      const success = await createAudioChunk(textChunks[i], i);
      if (success) successCount++;
    }

    console.log(
      `Обработка завершена: ${successCount} из ${textChunks.length} аудиофайлов успешно создано или уже существовало.`
    );
  } catch (error) {
    console.error("Ошибка при обработке:", error.message);
  }
}

// Вызов функции
textToSpeech();