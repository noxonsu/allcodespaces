import os
import requests
import json
from dotenv import load_dotenv
from flask import current_app
from typing import List, Dict, Any

# Импортируем функции кэширования сегментации и генерации хэша
from .cache_service import _generate_hash, get_cached_segmentation, save_segmentation_to_cache

class LLMService:
    def __init__(self, deepseek_api_key: str, openai_api_key: str):
        self.deepseek_api_key = deepseek_api_key
        self.openai_api_key = openai_api_key
        self.use_openai = bool(openai_api_key) # Если ключ OpenAI есть, используем OpenAI

        if self.use_openai:
            self.api_url = "https://api.openai.com/v1/chat/completions"
            self.default_model = "gpt-4o-nano" # Указанная модель для OpenAI
            self.service_name = "OpenAI"
            self.api_key = self.openai_api_key
        else:
            self.api_url = "https://api.deepseek.com/chat/completions"
            self.default_model = "deepseek-chat"
            self.service_name = "DeepSeek"
            self.api_key = self.deepseek_api_key

    def _get_logger(self):
        return current_app.logger if current_app else None

    def generate_text(self, prompt: str, model: str = None, temperature: float = 0.7, max_tokens: int = 500, timeout: int = 90) -> str:
        logger = self._get_logger()
        
        # Если модель не указана, используем дефолтную для выбранного сервиса
        if model is None:
            model_to_use = self.default_model
        else:
            model_to_use = model

        if logger:
            logger.info(f"{self.service_name}Service: Вызов generate_text для промпта (первые 250 символов): '{prompt[:250]}...'")

        if not self.api_key:
            error_msg = f"{self.service_name}Service: API ключ не установлен."
            if logger:
                logger.error(error_msg)
            raise ValueError(error_msg)

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        data = {
            "model": model_to_use,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            logger.info(f"{self.service_name}Service: Отправка запроса к {self.service_name} API. URL: {self.api_url}, Модель: {model_to_use}, Таймаут: {timeout}s")
            response = requests.post(self.api_url, headers=headers, json=data, timeout=timeout)
            response.raise_for_status()
            
            response_json = response.json()
            
            if 'choices' in response_json and len(response_json['choices']) > 0:
                content = response_json['choices'][0]['message']['content']
                if logger:
                    logger.info(f"{self.service_name}Service: Текст успешно сгенерирован (первые 250 символов): '{content[:250]}...'")
                return content.strip()
            else:
                error_message = response_json.get("error", {}).get("message", "Неизвестная ошибка формата ответа")
                if logger:
                    logger.error(f"{self.service_name}Service: Ошибка формата ответа от {self.service_name}: {error_message} | Полный ответ: {response_json}")
                raise ValueError(f"Ошибка формата ответа от {self.service_name}: {error_message}")

        except requests.exceptions.Timeout as e:
            error_msg = f"{self.service_name}Service: Таймаут запроса к {self.service_name} API после {timeout} секунд: {e}"
            if logger:
                logger.error(error_msg)
            raise TimeoutError(error_msg) from e
        except requests.exceptions.HTTPError as e:
            error_msg = f"{self.service_name}Service: HTTP Ошибка от {self.service_name} API: {e.response.status_code} - {e.response.text}"
            if logger:
                logger.error(error_msg)
            raise ConnectionError(error_msg) from e
        except requests.exceptions.ConnectionError as e:
            error_msg = f"{self.service_name}Service: Ошибка соединения с {self.service_name} API: {e}"
            if logger:
                logger.error(error_msg)
            raise ConnectionError(error_msg) from e
        except requests.exceptions.RequestException as e:
            error_msg = f"{self.service_name}Service: Общая ошибка запроса к {self.service_name} API: {e}"
            if logger:
                logger.error(error_msg)
            raise RuntimeError(error_msg) from e
        except json.JSONDecodeError as e:
            error_msg = f"{self.service_name}Service: Ошибка декодирования JSON от {self.service_name} API: {e}. Ответ: {response.text[:1000]}"
            if logger:
                logger.error(error_msg)
            raise ValueError(error_msg) from e
        except Exception as e:
            error_msg = f"{self.service_name}Service: Неизвестная ошибка при работе с {self.service_name} API: {e}"
            if logger:
                logger.error(error_msg, exc_info=True)
            raise RuntimeError(error_msg) from e

    def analyze_sentence_in_context(self, sentence: str, full_contract_context: str) -> str:
        logger = self._get_logger()
        if logger:
            logger.info(f"{self.service_name}Service: Вызов analyze_sentence_in_context для предложения: '{sentence[:250]}...'")

        # Для DeepSeek использовалась deepseek-reasoner, для OpenAI используем gpt-4o-nano
        model_for_analysis = "deepseek-reasoner" if not self.use_openai else "gpt-4o-nano"

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
        return self.generate_text(prompt, model=model_for_analysis, max_tokens=500, temperature=0, timeout=90)

    def analyze_paragraph_in_context(self, paragraph: str, full_contract_context: str) -> str:
        logger = self._get_logger()
        if logger:
            logger.info(f"{self.service_name}Service: Вызов analyze_paragraph_in_context для пункта: '{paragraph[:250]}...'")

        # Для DeepSeek использовалась deepseek-reasoner, для OpenAI используем gpt-4o-nano
        model_for_analysis = "deepseek-reasoner" if not self.use_openai else "gpt-4o-nano"

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
        return self.generate_text(prompt, model=model_for_analysis, max_tokens=1500, temperature=0, timeout=120)

    def segment_text_into_paragraphs(self, text_content: str) -> List[str]:
        logger = self._get_logger()
        if logger:
            logger.info(f"{self.service_name}Service: Вызов segment_text_into_paragraphs для текста (первые 250 символов): '{text_content[:250]}'")

        text_hash = _generate_hash(text_content)
        cached_paragraphs = get_cached_segmentation(text_hash)
        if cached_paragraphs:
            if logger:
                logger.info(f"{self.service_name}Service: Результат сегментации для хэша {text_hash} найден в кэше.")
            return cached_paragraphs

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
        {text_content}
        ---
        Результат:
        """
        
        raw_segmented_text = self.generate_text(prompt, model=self.default_model, max_tokens=2000, temperature=0, timeout=120)
        
        if logger:
            logger.info(f"{self.service_name}Service: Полный ответ от {self.service_name} для сегментации (до разделения): '{raw_segmented_text[:500]}'")

        paragraphs = [p.strip() for p in raw_segmented_text.split('\n') if p.strip()]
        
        filtered_paragraphs = []
        for s in paragraphs:
            stripped_s = s.strip()
            if stripped_s and not stripped_s.startswith('#'):
                filtered_paragraphs.append(stripped_s)

        if logger:
            logger.info(f"{self.service_name}Service: Получено {len(filtered_paragraphs)} отфильтрованных пунктов после сегментации.")
        
        save_segmentation_to_cache(text_hash, filtered_paragraphs)
        if logger:
            logger.info(f"{self.service_name}Service: Результат сегментации для хэша {text_hash} сохранен в кэш.")

        return filtered_paragraphs
