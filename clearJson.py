import json

# Функция для упрощения текста
def simplify_text(text):
    if isinstance(text, list):  # Если "text" — массив
        result = ""
        for item in text:
            if isinstance(item, str):  # Если элемент — строка
                result += item
            elif isinstance(item, dict) and "type" in item and "text" in item:  # Если объект
                if item["type"] == "bold":  # Для "bold" добавляем [b]
                    result += "[b]" + item["text"] + "[/b]"
                else:
                    result += item["text"]  # Для других типов — просто текст
        return result
    else:
        return text  # Если "text" уже строка, оставляем как есть

# Чтение JSON из файла
with open('result.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Удаление полей дат
fields_to_remove = ["date", "date_unixtime", "edited", "edited_unixtime"]
for field in fields_to_remove:
    if field in data:
        del data[field]

# Преобразование "text"
if "text" in data:
    data["text"] = simplify_text(data["text"])

# Удаление "text_entities"
if "text_entities" in data:
    del data["text_entities"]

# Сохранение в новый файл без форматирования
with open('result2.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)

print("JSON обработан и сохранен в result2.json")