#!/bin/bash

# Путь к файлу style.css
STYLE_CSS="style.css"

# Проверяем, существует ли style.css
if [ ! -f "$STYLE_CSS" ]; then
    echo "❌ Файл style.css отсутствует. Создаю новый..."
    cat <<EOL > $STYLE_CSS
/*
 Theme Name: Him Partners Theme
 Author: Grok 3
 Version: 1.0
*/
EOL
else
    # Читаем первые строки файла, чтобы проверить заголовок
    HEADER=$(head -n 5 "$STYLE_CSS" | grep "Theme Name")
    if [ -z "$HEADER" ]; then
        echo "⚠️ В style.css отсутствует заголовок темы. Исправляю..."
        # Сохраняем существующий контент
        TEMP_CONTENT=$(cat "$STYLE_CSS")
        # Перезаписываем файл с новым заголовком
        cat <<EOL > $STYLE_CSS
/*
 Theme Name: Him Partners Theme
 Author: Grok 3
 Version: 1.0
*/
$TEMP_CONTENT
EOL
    else
        echo "✅ Заголовок в style.css присутствует."
    fi
fi

# Проверяем, пустой ли файл
if [ ! -s "$STYLE_CSS" ]; then
    echo "⚠️ Файл style.css пуст. Добавляю минимальный заголовок..."
    cat <<EOL > $STYLE_CSS
/*
 Theme Name: Him Partners Theme
 Author: Grok 3
 Version: 1.0
*/
EOL
fi

# Исправляем права доступа
echo "🔧 Устанавливаю права доступа для style.css..."
chmod 644 "$STYLE_CSS"

# Проверяем права доступа к папке темы
echo "🔧 Устанавливаю права доступа для папки темы..."
chmod 755 .

echo "✅ Исправления завершены. Попробуйте снова проверить тему в админ-панели WordPress."