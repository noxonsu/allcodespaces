import os
import yaml
from flask import render_template
from .llm_service import LLMService # Изменено на LLMService
from .yandex_wordstat_service import YandexWordstatService
from .parsing_service import ParsingService # Для анализа на лету
# Импортируем новые функции кэширования для SEO
from .cache_service import get_cached_paragraph_analysis, save_paragraph_analysis_to_cache, _generate_hash # Удаляем get_seo_cached_analysis, save_seo_analysis_to_cache
import markdown # Добавляем импорт markdown

class SeoService:
    def __init__(self, llm_service: LLMService, yandex_wordstat_service: YandexWordstatService, parsing_service: ParsingService, content_base_path: str): # Изменено на llm_service
        self.llm_service = llm_service # Изменено на llm_service
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

        analysis_results = {"summary": "Договор пуст, анализ невозможен.", "paragraphs": []}
        if generated_contract_text:
            if logger:
                logger.info("SeoService: Выполняем анализ 'на лету' для SEO-страницы, полагаясь на гранулированное кэширование абзацев.")
            # Выполнение анализа "на лету", который теперь использует кэш сегментации и кэш абзацев
            analysis_results = self._perform_on_the_fly_analysis(generated_contract_text)
        else:
            if logger:
                logger.warning("SeoService: Текст договора для SEO-страницы пуст, анализ невозможен.")


        # Подготовка данных для шаблона index_template.html
        # Важно: contract_text_raw и analysis_results_raw должны быть строками, содержащими JSON, или None
        import json # Добавляем импорт json для сериализации

        contract_text_raw_json = json.dumps(generated_contract_text) if generated_contract_text else None
        analysis_results_raw_json = json.dumps(analysis_results) if analysis_results else None

        template_data = {
            "is_seo_page": True,
            "page_title": front_matter.get("title", slug),
            "page_h1": front_matter.get("title", slug), # Используем title для H1 на SEO-страницах
            "meta_keywords": ", ".join(front_matter.get("meta_keywords", [])),
            "meta_description": front_matter.get("meta_description", ""),
            "related_keywords_meta": front_matter.get("related_keywords", []), # Для meta name="related-keywords"
            "related_keywords_list": front_matter.get("related_keywords", []), # Для отображения списка на странице
            "page_text_content": markdown.markdown(page_text_content), # Конвертируем Markdown в HTML
            "main_keyword": front_matter.get("main_keyword", slug),
            "contract_text_raw": contract_text_raw_json, # Передаем как JSON-строку
            "analysis_results_raw": analysis_results_raw_json # Передаем как JSON-строку
        }
        
        if logger:
            logger.info(f"SeoService: Данные, передаваемые в шаблон 'index_template.html' для '{slug}':")
            logger.info(f"  is_seo_page: {template_data['is_seo_page']}")
            logger.info(f"  page_title: {template_data['page_title']}")
            logger.info(f"  meta_keywords: {template_data['meta_keywords']}")
            logger.info(f"  meta_description: {template_data['meta_description']}")
            logger.info(f"  related_keywords_list: {template_data['related_keywords_list']}")
            logger.info(f"  page_text_content (первые 100): {template_data['page_text_content'][:100]}...")
            logger.info(f"  main_keyword: {template_data['main_keyword']}")
            logger.info(f"  contract_text_raw (json, первые 100): {template_data['contract_text_raw'][:100] if template_data['contract_text_raw'] else 'None'}...")
            logger.info(f"  analysis_results_raw (json, первые 100): {template_data['analysis_results_raw'][:100] if template_data['analysis_results_raw'] else 'None'}...")

        return render_template('index_template.html', **template_data)

    def _perform_on_the_fly_analysis(self, contract_text: str):
        logger = self._get_logger()
        if not contract_text:
            return {"summary": "Договор пуст, анализ невозможен.", "paragraphs": []}

        # Используем llm_service для сегментации, чтобы она кэшировалась
        paragraphs = self.llm_service.segment_text_into_paragraphs(contract_text) # Изменено на llm_service
        
        # Анализ каждого абзаца с LLM, используя analyze_paragraph_in_context
        analyzed_paragraphs = []
        file_hash = _generate_hash(contract_text) # Генерируем хеш для всего договора

        for i, paragraph in enumerate(paragraphs): # Анализируем все абзацы
            if logger:
                logger.info(f"SeoService: Подготовка к анализу пункта {i+1}/{len(paragraphs)} для file_hash: {file_hash}, paragraph_hash: {_generate_hash(paragraph)}")

            analysis_html = get_cached_paragraph_analysis(file_hash, paragraph) # Пытаемся получить HTML из кэша

            if analysis_html:
                if logger:
                    logger.info(f"SeoService: Анализ пункта {i+1} найден в индивидуальном кэше (HTML).")
            else:
                if logger:
                    logger.info(f"SeoService: Анализ пункта {i+1} не найден в кэше, выполняем через LLM.")
                try:
                    # Получаем анализ в Markdown от LLM
                    analysis_markdown = self.llm_service.analyze_paragraph_in_context(paragraph, contract_text) # Изменено на llm_service
                    if analysis_markdown:
                        # Конвертируем в HTML
                        analysis_html = markdown.markdown(analysis_markdown)
                        # Сохраняем HTML в индивидуальный кэш абзацев
                        save_paragraph_analysis_to_cache(file_hash, paragraph, analysis_html)
                        if logger:
                            logger.info(f"SeoService: Анализ пункта {i+1} выполнен, сконвертирован в HTML и сохранен в индивидуальный кэш.")
                    else:
                        analysis_html = "Не удалось получить анализ для этого пункта."
                        if logger:
                            logger.warning(f"SeoService: Не удалось получить анализ (Markdown) для пункта {i+1}. LLM вернул пустой ответ.")
                except Exception as e:
                    if logger:
                        logger.error(f"SeoService: Ошибка при анализе абзаца {i+1} с LLM: {e}", exc_info=True) # Изменено на LLM
                    analysis_html = f"Ошибка анализа пункта: {e}"
            
            analyzed_paragraphs.append({
                "original_paragraph": paragraph,
                "analysis": analysis_html # Добавляем HTML
            })
        
        return {
            "summary": "Это анализ договора, выполненный 'на лету'.",
            "paragraphs": analyzed_paragraphs
        }
