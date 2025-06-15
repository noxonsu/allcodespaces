import os
import requests
import json
from dotenv import load_dotenv
from flask import current_app # Добавляем импорт current_app для логирования

class DeepSeekService:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.api_url = "https://api.deepseek.com/chat/completions"

    def _get_logger(self):
        return current_app.logger if current_app else None

    def generate_text(self, prompt: str, model: str = "deepseek-chat", temperature: float = 0.7, max_tokens: int = 500, timeout: int = 90) -> str: # Добавляем параметр timeout
        logger = self._get_logger()
        if logger:
            logger.info(f"DeepSeekService: Вызов generate_text для промпта (первые 250 символов): '{prompt[:250]}...'")

        if not self.api_key:
            error_msg = "DeepSeekService: API ключ DeepSeek не установлен."
            if logger:
                logger.error(error_msg)
            raise ValueError(error_msg)

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        data = {
            "model": model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            logger.info(f"DeepSeekService: Отправка запроса к DeepSeek API. URL: {self.api_url}, Модель: {model}, Таймаут: {timeout}s")
            response = requests.post(self.api_url, headers=headers, json=data, timeout=timeout)
            response.raise_for_status() # Вызовет исключение для HTTP ошибок 4xx/5xx
            
            response_json = response.json()
            
            if 'choices' in response_json and len(response_json['choices']) > 0:
                content = response_json['choices'][0]['message']['content']
                if logger:
                    logger.info(f"DeepSeekService: Текст успешно сгенерирован (первые 250 символов): '{content[:250]}...'")
                return content.strip()
            else:
                error_message = response_json.get("error", {}).get("message", "Неизвестная ошибка формата ответа")
                if logger:
                    logger.error(f"DeepSeekService: Ошибка формата ответа от DeepSeek: {error_message} | Полный ответ: {response_json}")
                raise ValueError(f"Ошибка формата ответа от DeepSeek: {error_message}")

        except requests.exceptions.Timeout as e:
            error_msg = f"DeepSeekService: Таймаут запроса к DeepSeek API после {timeout} секунд: {e}"
            if logger:
                logger.error(error_msg)
            raise TimeoutError(error_msg) from e
        except requests.exceptions.HTTPError as e:
            error_msg = f"DeepSeekService: HTTP Ошибка от DeepSeek API: {e.response.status_code} - {e.response.text}"
            if logger:
                logger.error(error_msg)
            raise ConnectionError(error_msg) from e
        except requests.exceptions.ConnectionError as e:
            error_msg = f"DeepSeekService: Ошибка соединения с DeepSeek API: {e}"
            if logger:
                logger.error(error_msg)
            raise ConnectionError(error_msg) from e
        except requests.exceptions.RequestException as e:
            error_msg = f"DeepSeekService: Общая ошибка запроса к DeepSeek API: {e}"
            if logger:
                logger.error(error_msg)
            raise RuntimeError(error_msg) from e
        except json.JSONDecodeError as e:
            error_msg = f"DeepSeekService: Ошибка декодирования JSON от DeepSeek API: {e}. Ответ: {response.text[:1000]}"
            if logger:
                logger.error(error_msg)
            raise ValueError(error_msg) from e
        except Exception as e:
            error_msg = f"DeepSeekService: Неизвестная ошибка при работе с DeepSeek API: {e}"
            if logger:
                logger.error(error_msg, exc_info=True)
            raise RuntimeError(error_msg) from e

    def analyze_sentence_in_context(self, sentence: str, full_contract_context: str) -> str:
        logger = self._get_logger()
        if logger:
            logger.info(f"DeepSeekService: Вызов analyze_sentence_in_context для предложения: '{sentence[:250]}...'")

        prompt = f"""
        Проанализируй следующее предложение с юридической точки зрения, учитывая полный контекст договора.
        Укажи потенциальные риски, дай рекомендации по улучшению формулировки и объясни, как это предложение связано с другими частями документа.
        Предоставь анализ в виде связного текста.

        Полный текст договора для контекста:
        ---
        {full_contract_context}
        ---
        Предложение для анализа:
        ---
        {sentence}
        ---
        Твой анализ:
        """
        return self.generate_text(prompt, model="deepseek-reasoner", max_tokens=500, temperature=0, timeout=90) # Увеличиваем таймаут для более сложных запросов

    def analyze_paragraph_in_context(self, paragraph: str, full_contract_context: str) -> str:
        logger = self._get_logger()
        if logger:
            logger.info(f"DeepSeekService: Вызов analyze_paragraph_in_context для пункта: '{paragraph[:250]}...'")

        prompt = f"""
        Проанализируй следующий пункт/абзац с юридической точки зрения, учитывая полный контекст договора.
        Укажи потенциальные риски, дай рекомендации по улучшению формулировки и объясни, как этот пункт/абзац связан с другими частями документа.
        Предоставь анализ в виде связного текста.

        Полный текст договора для контекста:
        ---
        {full_contract_context}
        ---
        Пункт/абзац для анализа:
        ---
        {paragraph}
        ---
        Твой анализ:
        """
        return self.generate_text(prompt, model="deepseek-reasoner", max_tokens=700, temperature=0, timeout=120) # Увеличиваем max_tokens и таймаут

    def segment_text_into_paragraphs(self, text: str) -> list:
        logger = self._get_logger();
        if logger:
            logger.info(f"DeepSeekService: Вызов segment_text_into_paragraphs для текста (первые 250 символов): '{text[:250]}...'")

        prompt = f"""
        Разбей следующий текст на отдельные пункты или смысловые абзацы. Каждый пункт должен быть на новой строке.
        Не добавляй никаких дополнительных комментариев или пояснений, только список пунктов.
        Учитывай, что пункты могут быть обозначены цифрами, буквами или просто отдельными абзацами.

        Пример:
        Текст: "1. Первый пункт. Это его продолжение. 2. Второй пункт. 3. Третий пункт."
        Результат:
        1. Первый пункт. Это его продолжение.
        2. Второй пункт.
        3. Третий пункт.

        Текст: "Арендодатель обязуется предоставить. Арендатор обязуется принять. Стороны договорились."
        Результат:
        Арендодатель обязуется предоставить.
        Арендатор обязуется принять.
        Стороны договорились.

        Текст для сегментации:
        ---
        {text}
        ---
        Результат:
        """
        response = self.generate_text(prompt, max_tokens=2000, temperature=0, timeout=120) # Увеличиваем max_tokens и таймаут для более длинных пунктов
        return [s.strip() for s in response.split('\n') if s.strip()]
