import os
import yaml
from flask import render_template
from .deepseek_service import DeepSeekService
from .yandex_wordstat_service import YandexWordstatService
from .parsing_service import ParsingService # Для анализа на лету
from .cache_service import get_cached_analysis, save_analysis_to_cache # Импортируем функции кэширования

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

        analysis_results = None
        if generated_contract_text:
            # Попытка получить кэшированный анализ
            analysis_results = get_cached_analysis(generated_contract_text)
            if analysis_results:
                if logger:
                    logger.info("SeoService: Анализ договора найден в кэше.")
            else:
                if logger:
                    logger.info("SeoService: Анализ договора не найден в кэше, выполняем анализ 'на лету'.")
                # Выполнение анализа "на лету"
                analysis_results = self._perform_on_the_fly_analysis(generated_contract_text)
                # Сохранение результатов в кэш
                save_analysis_to_cache(generated_contract_text, analysis_results)
        else:
            analysis_results = {"summary": "Договор пуст, анализ невозможен.", "paragraphs": []}


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
        
        if logger:
            logger.info(f"SeoService: Данные, передаваемые в шаблон для '{slug}':")
            logger.info(f"  title: {template_data['title']}")
            logger.info(f"  meta_keywords: {template_data['meta_keywords']}")
            logger.info(f"  meta_description: {template_data['meta_description']}")
            logger.info(f"  related_keywords: {template_data['related_keywords']}")
            logger.info(f"  contract_text (первые 250): {template_data['contract_text'][:250]}...")
            logger.info(f"  analysis_results (summary): {template_data['analysis_results'].get('summary', 'N/A')}")
            logger.info(f"  analysis_results (paragraphs count): {len(template_data['analysis_results'].get('paragraphs', []))}")
            # Логируем первые 250 символов анализа первого абзаца, если он есть
            if template_data['analysis_results'].get('paragraphs') and len(template_data['analysis_results']['paragraphs']) > 0:
                first_paragraph_analysis = template_data['analysis_results']['paragraphs'][0].get('analysis', 'N/A')
                logger.info(f"  first_paragraph_analysis (первые 250): {first_paragraph_analysis[:250]}...")
            else:
                logger.info(f"  analysis_results.paragraphs пуст или отсутствует.")

        return render_template('seo_page_template.html', **template_data)

    def _perform_on_the_fly_analysis(self, contract_text: str):
        logger = self._get_logger()
        if not contract_text:
            return {"summary": "Договор пуст, анализ невозможен.", "paragraphs": []}

        paragraphs = self.parsing_service.segment_text_into_paragraphs(contract_text)
        
        # Имитация анализа каждого абзаца с DeepSeek
        analyzed_paragraphs = []
        for i, paragraph in enumerate(paragraphs): # Анализируем все абзацы
            prompt = f"Проанализируй следующий абзац из договора на предмет потенциальных рисков и дай краткую рекомендацию по улучшению формулировки. Абзац: '{paragraph}'"
            try:
                analysis_response = self.deepseek_service.generate_text(prompt)
                analyzed_paragraphs.append({
                    "original_paragraph": paragraph,
                    "analysis": analysis_response
                })
            except Exception as e:
                if logger:
                    logger.error(f"SeoService: Ошибка при анализе абзаца с DeepSeek: {e}")
                analyzed_paragraphs.append({
                    "original_paragraph": paragraph,
                    "analysis": "Ошибка анализа."
                })
        
        return {
            "summary": "Это имитация анализа договора. Для полного анализа используйте основной интерфейс.",
            "paragraphs": analyzed_paragraphs
        }
