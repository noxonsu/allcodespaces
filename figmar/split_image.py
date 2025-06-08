import cv2
from pathlib import Path
from typing import List, Dict, Any

def split_image_intellectually(
    image_src: str,
    expected_columns: int,
) -> List[Dict[str, Any]]:
    """
    Разрезает изображение на ожидаемое число вертикальных колонок.
    Возвращает список метаданных с путями к сохранённым файлам.
    """
    # Загружаем изображение
    img = cv2.imread(image_src)
    if img is None:
        raise ValueError(f"Не удалось загрузить изображение: {image_src}")

    height, width = img.shape[:2]
    # Определяем ширину одной колонки (последняя может быть шире)
    col_width = width // expected_columns

    # Директория для сохранения колонок
    out_dir = Path('columns_py_opencv_actual_images') / Path(image_src).stem
    out_dir.mkdir(parents=True, exist_ok=True)

    columns: List[Dict[str, Any]] = []
    for i in range(expected_columns):
        x_start = i * col_width
        x_end = width if i == expected_columns - 1 else (i + 1) * col_width

        # Вырезаем колонку
        col_img = img[:, x_start:x_end]

        # Сохраняем колонку
        out_path = out_dir / f'column_{i+1}.png'
        success = cv2.imwrite(str(out_path), col_img)
        if not success:
            print(f"Не удалось сохранить колонку {i+1} в файл: {out_path}")
            continue

        columns.append({
            'index': i + 1,
            'path': str(out_path),
            'width': x_end - x_start,
            'height': height,
        })

    return columns