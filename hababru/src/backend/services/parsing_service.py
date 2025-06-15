import io
import os
from markitdown import MarkItDown
from flask import current_app # Для логирования

from .deepseek_service import DeepSeekService # Импортируем DeepSeekService

class ParsingService:
    def __init__(self, deepseek_service: DeepSeekService):
        self.deepseek_service = deepseek_service

    def _get_logger(self):
        return current_app.logger if current_app else None

    def parse_document_to_markdown(self, file_stream, filename: str) -> str:
        """
        Конвертирует документ (PDF, DOC, DOCX) в Markdown с помощью MarkItDown.
        :param file_stream: Поток байтов файла.
        :param filename: Имя файла (для определения типа, если необходимо).
        :return: Текст в формате Markdown или None в случае ошибки.
        """
        logger = self._get_logger()
        if logger:
            logger.info(f"ParsingService: Попытка конвертации файла '{filename}' в Markdown.")
        try:
            converter = MarkItDown()
            markdown_result = converter.convert_stream(file_stream, filename=filename)
            if logger:
                logger.info(f"ParsingService: Файл '{filename}' успешно сконвертирован в Markdown.")
            return markdown_result.markdown
        except Exception as e:
            if logger:
                logger.error(f"ParsingService: Ошибка при конвертации файла '{filename}' в Markdown с помощью MarkItDown: {e}")
            else:
                print(f"Ошибка при конвертации файла '{filename}' в Markdown с помощью MarkItDown: {e}")
            return None

    def segment_text_into_paragraphs(self, text: str) -> list:
        """
        Разбивает текст на пункты/абзацы, используя DeepSeekService.
        :param text: Входной текст.
        :return: Список пунктов/абзацев.
        """
        logger = self._get_logger()
        if logger:
            logger.info(f"ParsingService: Сегментация текста на пункты с помощью DeepSeekService (первые 250 символов): '{text[:250]}...'")
        
        if not text:
            return []

        try:
            paragraphs = self.deepseek_service.segment_text_into_paragraphs(text)
            if logger:
                logger.info(f"ParsingService: Сегментация текста завершена, получено {len(paragraphs)} пунктов.")
            return paragraphs
        except Exception as e:
            error_msg = f"ParsingService: Ошибка при сегментации текста на пункты с DeepSeekService: {e}"
            if logger:
                logger.error(error_msg)
            raise RuntimeError(error_msg) from e
