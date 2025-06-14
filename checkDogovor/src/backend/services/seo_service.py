import os
import yaml
from flask import render_template
from .deepseek_service import DeepSeekService
from .yandex_wordstat_service import YandexWordstatService
from .parsing_service import ParsingService # Для анализа на лету

class SeoService:
    def __init__(self, deepseek_service: DeepSeekService, yandex_wordstat_service: YandexWordstatService, parsing_service: ParsingService, content_base_path: str):
        self.deepseek_service = deepseek_service
        self.yandex_wordstat_service = yandex_wordstat_service
        self.parsing_service = parsing_service
        self.content_base_path = content_base_path

    def _get_logger(self):
        from flask import current_app # Импортируем здесь, чтобы избежать циклических зависимостей на уровне модуля
        return current_app.logger if current_app else None

    def render_seo_page(self, slug: str) -> str:
        logger = self._get_logger()
        page_dir = os.path.join(self.content_base_path, slug)
        source_md_path = os.path.join(page_dir, 'source.md')
        contract_file_path = os.path.join(page_dir, 'generated_contract.txt')

        if logger:
            logger.info(f"SeoService: Попытка загрузить source.md из: {source_md_path}")

        if not os.path.exists(source_md_path):
            if logger:
                logger.error(f"SeoService: Файл source.md не найден по пути: {source_md_path}")
            raise FileNotFoundError(f"SEO-страница не найдена для слага: {slug} (ожидался файл: {source_md_path})")

        # Чтение source.md
        with open(source_md_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Разделение YAML Front Matter и основного текста
        parts = content.split('---', 2)
        if len(parts) < 3:
            raise ValueError("Некорректный формат source.md: отсутствует YAML Front Matter.")
        
        front_matter = yaml.safe_load(parts[1])
        page_text_content = parts[2].strip()

        # Чтение сгенерированного договора
        generated_contract_text = ""
        if os.path.exists(contract_file_path):
            with open(contract_file_path, 'r', encoding='utf-8') as f:
                generated_contract_text = f.read()
        else:
            print(f"Внимание: Файл договора не найден для SEO-страницы: {contract_file_path}")

        # Имитация анализа договора "на лету"
        # В реальной системе здесь будет вызов вашей существующей логики анализа
        # Для демонстрации, пока просто заглушка или упрощенный анализ
        analysis_results = self._perform_on_the_fly_analysis(generated_contract_text)

        # Подготовка данных для шаблона
        template_data = {
            "title": front_matter.get("title", slug),
            "meta_keywords": ", ".join(front_matter.get("meta_keywords", [])),
            "meta_description": front_matter.get("meta_description", ""),
            "related_keywords": front_matter.get("related_keywords", []), # Передаем как список для итерации
            "contract_text": generated_contract_text,
            "analysis_results": analysis_results,
            "page_text_content": page_text_content,
            "main_keyword": front_matter.get("main_keyword", slug)
        }
        
        return render_template('seo_page_template.html', **template_data)

    def _perform_on_the_fly_analysis(self, contract_text: str):
        # Это заглушка для вашей существующей системы анализа.
        # В реальной системе здесь будет вызов, аналогичный тому, что происходит при ?test=dubna.pdf
        # Например, можно было бы вызвать метод из contract_analyzer.py или parsing_service.py
        # и deepseek_service.py для получения анализа.
        
        if not contract_text:
            return {"summary": "Договор пуст, анализ невозможен.", "sentences": []}

        # Это заглушка для вашей существующей системы анализа.
        # В реальной системе здесь будет вызов, аналогичный тому, что происходит при ?test=dubna.pdf
        # Например, можно было бы вызвать метод из contract_analyzer.py или parsing_service.py
        # и deepseek_service.py для получения анализа.
        
        if not contract_text:
            return {"summary": "Договор пуст, анализ невозможен.", "sentences": []}

        # Пример очень упрощенного анализа:
        sentences = self.parsing_service.segment_text_into_sentences(contract_text)
        
        # Имитация анализа каждого предложения с DeepSeek
        analyzed_sentences = []
        for i, sentence in enumerate(sentences[:5]): # Анализируем только первые 5 предложений для примера
            prompt = f"Проанализируй следующее предложение из договора на предмет потенциальных рисков и дай краткую рекомендацию по улучшению формулировки. Предложение: '{sentence}'"
            try:
                analysis_response = self.deepseek_service.generate_text(prompt)
                analyzed_sentences.append({
                    "original_sentence": sentence,
                    "analysis": analysis_response
                })
            except Exception as e:
                if logger:
                    logger.error(f"SeoService: Ошибка при анализе предложения с DeepSeek: {e}")
                analyzed_sentences.append({
                    "original_sentence": sentence,
                    "analysis": "Ошибка анализа."
                })
        
        return {
            "summary": "Это имитация анализа договора. Для полного анализа используйте основной интерфейс.",
            "sentences": analyzed_sentences
        }
