import os
import yaml
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

# Импортируем сервисы, которые будут использоваться
from .deepseek_service import DeepSeekService
from .yandex_wordstat_service import YandexWordstatService

class ContentGenerationService:
    def __init__(self, deepseek_service: DeepSeekService, yandex_wordstat_service: YandexWordstatService):
        self.deepseek_service = deepseek_service
        self.yandex_wordstat_service = yandex_wordstat_service
        self.use_yandex_wordstat = os.getenv('USE_YANDEX_WORDSTAT', 'false').lower() == 'true'

    def generate_all_for_keyword(self, keyword: str, slug: str, seo_page_dir: str):
        print(f"ContentGenerationService: Начинаем генерацию для '{keyword}'")

        # 1. Генерация текста договора
        contract_text = self._generate_contract_text(keyword)
        contract_file_path = os.path.join(seo_page_dir, 'generated_contract.txt')
        with open(contract_file_path, 'w', encoding='utf-8') as f:
            f.write(contract_text)
        print(f"Сгенерирован и сохранен договор: {contract_file_path}")

        # 2. Получение/Генерация ключевых слов
        meta_keywords, related_keywords = self._get_or_generate_keywords(keyword)
        print(f"Получены/сгенерированы meta_keywords: {meta_keywords}")
        print(f"Получены/сгенерированы related_keywords: {related_keywords}")

        # 3. Генерация Meta Description
        meta_description = self._generate_meta_description(keyword, meta_keywords)
        print(f"Сгенерировано meta_description: {meta_description}")

        # 4. Генерация основного текста страницы
        page_text_content = self._generate_page_text_content(keyword)
        print(f"Сгенерирован основной текст страницы.")

        # 5. Сборка source.md
        self._assemble_source_md(
            seo_page_dir,
            keyword, # Используем keyword как title
            meta_keywords,
            meta_description,
            related_keywords,
            os.path.basename(contract_file_path), # Только имя файла
            page_text_content
        )
        print(f"Собран source.md в {seo_page_dir}")

    def _generate_contract_text(self, keyword: str) -> str:
        prompt = f"Сгенерируй типовой текст договора, который соответствует ключевому слову '{keyword}'. Договор должен быть юридически корректным, но упрощенным для примера. Включи основные разделы: предмет договора, права и обязанности сторон, срок действия, ответственность сторон, порядок разрешения споров, реквизиты сторон. Договор должен быть на русском языке."
        response = self.deepseek_service.generate_text(prompt)
        return response

    def _get_or_generate_keywords(self, keyword: str):
        meta_keywords = []
        related_keywords = []

        if self.use_yandex_wordstat:
            print("Попытка получить ключевые слова из Яндекс.Вордстат...")
            try:
                # Здесь предполагается, что yandex_wordstat_service.get_keywords возвращает словарь
                # с 'main_keywords' и 'related_keywords'
                wordstat_data = self.yandex_wordstat_service.get_keywords(keyword)
                meta_keywords = wordstat_data.get('main_keywords', [])
                related_keywords = wordstat_data.get('related_keywords', [])
                if not meta_keywords and not related_keywords:
                    raise ValueError("Яндекс.Вордстат вернул пустые данные.")
            except Exception as e:
                print(f"Ошибка при получении ключевых слов из Яндекс.Вордстат: {e}. Генерируем через DeepSeek.")
                meta_keywords = self._generate_keywords_with_deepseek(keyword, "meta")
                related_keywords = self._generate_keywords_with_deepseek(keyword, "related")
        else:
            print("Яндекс.Вордстат отключен в .env. Генерируем ключевые слова через DeepSeek.")
            meta_keywords = self._generate_keywords_with_deepseek(keyword, "meta")
            related_keywords = self._generate_keywords_with_deepseek(keyword, "related")
        
        return meta_keywords, related_keywords

    def _generate_keywords_with_deepseek(self, keyword: str, type: str) -> list:
        if type == "meta":
            prompt = f"Сгенерируй 3-5 мета-ключевых слов для SEO-страницы по теме '{keyword}'. Ключевые слова должны быть релевантными и высокочастотными. Перечисли их через запятую."
        elif type == "related":
            prompt = f"Сгенерируй 5-7 связанных ключевых слов для SEO-страницы по теме '{keyword}'. Эти слова должны быть смежными по смыслу и полезными для расширения семантики. Перечисли их через запятую."
        else:
            return []
        
        response = self.deepseek_service.generate_text(prompt)
        # Простая попытка распарсить строку с ключевыми словами
        return [k.strip() for k in response.split(',') if k.strip()]

    def _generate_meta_description(self, keyword: str, meta_keywords: list) -> str:
        prompt = f"Сгенерируй мета-описание (до 160 символов) для SEO-страницы по теме '{keyword}'. Включи в него ключевые слова: {', '.join(meta_keywords)}. Описание должно быть привлекательным и информативным."
        response = self.deepseek_service.generate_text(prompt)
        return response[:160] # Обрезаем до 160 символов

    def _generate_page_text_content(self, keyword: str) -> str:
        prompt = f"Напиши небольшой SEO-оптимизированный текст (200-300 слов) для страницы, посвященной '{keyword}'. Текст должен быть информативным, полезным для пользователя и содержать ключевое слово. Он будет размещен под формой анализа договора."
        response = self.deepseek_service.generate_text(prompt)
        return response

    def _assemble_source_md(self, seo_page_dir: str, title: str, meta_keywords: list, 
                             meta_description: str, related_keywords: list, 
                             contract_filename: str, page_text_content: str):
        
        front_matter = {
            "title": title,
            "meta_keywords": meta_keywords,
            "meta_description": meta_description,
            "related_keywords": related_keywords,
            "contract_file": contract_filename,
            "main_keyword": title # Используем title как main_keyword для консистентности
        }

        md_content = f"---\n{yaml.dump(front_matter, allow_unicode=True, sort_keys=False)}---\n\n{page_text_content}"
        
        source_md_path = os.path.join(seo_page_dir, 'source.md')
        with open(source_md_path, 'w', encoding='utf-8') as f:
            f.write(md_content)
