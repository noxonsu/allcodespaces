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
            logger.info(f"DeepSeekService: Вызов generate_text для промпта (первые 100 символов): '{prompt[:100]}...'")

        if not self.api_key:
            if logger:
                logger.error("DeepSeekService: API ключ DeepSeek не установлен.")
            return "Ошибка: API ключ DeepSeek не установлен."

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
            response = requests.post(self.api_url, headers=headers, json=data, timeout=timeout) # Используем переданный таймаут
            response.raise_for_status() 
            
            response_json = response.json()
            
            if 'choices' in response_json and len(response_json['choices']) > 0:
                content = response_json['choices'][0]['message']['content']
                if logger:
                    logger.info(f"DeepSeekService: Текст успешно сгенерирован (первые 100 символов): '{content[:100]}...'")
                return content.strip()
            else:
                error_message = response_json.get("error", {}).get("message", "Неизвестная ошибка формата ответа")
                if logger:
                    logger.error(f"DeepSeekService: Ошибка формата ответа от DeepSeek: {error_message} | {response_json}")
                return f"Ошибка генерации: {error_message}"

        except requests.exceptions.Timeout:
            if logger:
                logger.error(f"DeepSeekService: Таймаут запроса к DeepSeek API.")
            return "Ошибка генерации: превышено время ожидания ответа от сервиса DeepSeek."
        except requests.exceptions.RequestException as e:
            if logger:
                logger.error(f"DeepSeekService: Ошибка запроса к DeepSeek API: {e}")
            return f"Ошибка генерации: не удалось связаться с сервисом DeepSeek. {e}"
        except json.JSONDecodeError as e:
            if logger:
                logger.error(f"DeepSeekService: Ошибка декодирования JSON от DeepSeek API: {e}. Ответ: {response.text[:200]}")
            return "Ошибка генерации: получен некорректный ответ от сервиса DeepSeek."
        except Exception as e:
            if logger:
                logger.error(f"DeepSeekService: Неизвестная ошибка при работе с DeepSeek API: {e}")
            return f"Ошибка генерации: произошла внутренняя ошибка. {e}"

    def analyze_sentence_in_context(self, sentence: str, full_contract_context: str) -> str:
        logger = self._get_logger()
        if logger:
            logger.info(f"DeepSeekService: Вызов analyze_sentence_in_context для предложения: '{sentence[:100]}...'")

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

    def segment_text_with_deepseek(self, text: str) -> list:
        logger = self._get_logger()
        if logger:
            logger.info(f"DeepSeekService: Вызов segment_text_with_deepseek для текста (первые 100 символов): '{text[:100]}...'")

        prompt = f"""
        Разбей следующий текст на отдельные предложения. Каждое предложение должно быть на новой строке.
        Не добавляй никаких дополнительных комментариев или пояснений, только список предложений.

        Пример:
        Текст: "Привет. Как дела? Я иду домой."
        Результат:
        Привет.
        Как дела?
        Я иду домой.

        Текст: "Я Сергей Сергеевич беру в долг у Руина А.Е. 500 рублей до вторника. Если не отдам то верну 1000 рублей. Подпись"
        Результат:
        Я Сергей Сергеевич беру в долг у Руина А.Е. 500 рублей до вторника.
        Если не отдам то верну 1000 рублей.
        Подпись

        Текст для сегментации:
        ---
        {text}
        ---
        Результат:
        """
        response = self.generate_text(prompt, max_tokens=1000, temperature=0, timeout=90) # Увеличиваем таймаут
        return [s.strip() for s in response.split('\n') if s.strip()]
