# Reminder: To install OpenCV, use: pip install opencv-python
# If you encounter "ImportError: libGL.so.1: cannot open shared object file",
# you might need to install system dependencies. For Debian/Ubuntu:
# sudo apt-get update && sudo apt-get install -y libgl1-mesa-glx
import os
import math
from pathlib import Path
import cv2 # Added for OpenCV
import numpy as np # Added for OpenCV

# Conceptual image splitting function
def split_image_intellectually(
    image_src: str,
    screen_width_threshold: int = 400,
    expected_columns: int = 0,
    mock_image_width: int = 3840,
    mock_image_height: int = 2120
) -> list:
    """
    Conceptually or actually splits an image into columns.
    If expected_columns <= 0, attempts to use OpenCV for contour-based splitting.
    Otherwise, splits into a fixed number of columns.
    """
    print(f"Processing image from {image_src}")
    print(f"Image source path exists: {Path(image_src).exists()}") # Добавлено логирование

    actual_image_loaded = False
    img_cv = None
    
    # Attempt to load image with OpenCV to get actual dimensions if needed for intellectual split
    # or if we want to use actual dimensions for fixed split.
    try:
        img_cv = cv2.imread(image_src)
        if img_cv is not None:
            actual_image_height, actual_image_width = img_cv.shape[:2]
            image_width = actual_image_width
            image_height = actual_image_height
            actual_image_loaded = True
            print(f"Successfully loaded image with OpenCV. Dimensions: {image_width}x{image_height}")
        else:
            print(f"Warning: OpenCV could not load image from {image_src}. Using mock dimensions.")
            image_width = mock_image_width
            image_height = mock_image_height
    except Exception as e:
        print(f"Error loading image with OpenCV: {e}. Using mock dimensions.")
        image_width = mock_image_width
        image_height = mock_image_height

    if image_width <= screen_width_threshold and not (expected_columns <= 0 and actual_image_loaded):
        print("Image width is within screen threshold (or not using OpenCV split), no splitting needed based on threshold.")
        return [{"src": image_src, "x": 0, "y": 0, "width": image_width, "height": image_height}]

    print("Image width exceeds threshold or OpenCV splitting is requested, attempting to split.")
    column_boundaries = []

    if expected_columns <= 0 and actual_image_loaded and img_cv is not None:
        print("Conceptual: Attempting intellectual splitting using OpenCV contours.")
        try:
            gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
            # User suggested threshold: 240, 255, cv2.THRESH_BINARY_INV
            # This finds dark objects on a light background. Adjust if screens are light on dark.
            _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
            
            # Find contours
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if contours:
                # Sort contours by their x-coordinate
                bounding_boxes = [cv2.boundingRect(c) for c in contours]
                # Filter out very small contours if necessary, e.g., w < 10 or h < 10
                # bounding_boxes = [b for b in bounding_boxes if b[2] > 10 and b[3] > 10] 
                bounding_boxes.sort(key=lambda b: b[0]) 

                for i, (x, y_c, w_c, h_c) in enumerate(bounding_boxes):
                    # We are splitting into full-height columns based on detected x and width
                    column_boundaries.append({"x": x, "width": w_c})
                print(f"OpenCV found {len(contours)} contours, resulting in {len(column_boundaries)} potential columns.")
            else:
                print("OpenCV found no contours. Treating image as a single column.")
                column_boundaries.append({"x": 0, "width": image_width})

        except Exception as e:
            print(f"Error during OpenCV processing: {e}. Falling back to single column.")
            column_boundaries.append({"x": 0, "width": image_width})
            
    elif expected_columns > 0:
        print(f"Conceptual: Splitting into {expected_columns} predefined columns.")
        column_width_float = image_width / expected_columns
        for i in range(expected_columns):
            start_x = round(i * column_width_float)
            end_x = image_width if i == expected_columns - 1 else round((i + 1) * column_width_float)
            width = end_x - start_x
            column_boundaries.append({"x": start_x, "width": width})
    else: # Fallback if not using OpenCV and expected_columns is not positive
        print("Conceptual: expected_columns not provided or is zero, and OpenCV not used/failed. Treating image as a single column.")
        column_boundaries.append({"x": 0, "width": image_width})


    if not column_boundaries:
        print("Could not determine column boundaries. Returning original image representation.")
        return [{"src": image_src, "x": 0, "y": 0, "width": image_width, "height": image_height}]

    columns_metadata = []
    for i, boundary in enumerate(column_boundaries):
        print(f"Defining column {i+1} at x={boundary['x']}, width={boundary['width']}")
        columns_metadata.append({
            "original_src": image_src,
            "x": boundary["x"],
            "y": 0,  # Assuming columns are full height
            "width": boundary["width"],
            "height": image_height,  # Full image height for each column
            "saved_path": None # Добавляем поле для пути к сохраненному файлу
        })

    # --- Сохранение реальных обрезанных изображений колонок ---
    try:
        if actual_image_loaded and len(columns_metadata) > 0:
            # Директория: ./columns_py_opencv_actual_images/<stem>/
            base_output_dir = Path(__file__).parent / 'columns_py_opencv_actual_images'
            output_dir_for_image = base_output_dir / Path(image_src).stem
            output_dir_for_image.mkdir(parents=True, exist_ok=True)
            print(f"Saving columns to: {output_dir_for_image}") # Добавлено логирование

            for idx, col_meta in enumerate(columns_metadata):
                x, y, w, h = col_meta['x'], col_meta['y'], col_meta['width'], col_meta['height']
                # Safety checks
                if w <= 0 or h <= 0:
                    print(f"Skip saving column {idx + 1}: invalid dimensions w={w}, h={h}")
                    continue
                if x < 0 or y < 0 or x + w > image_width or y + h > image_height:
                    print(f"Skip saving column {idx + 1}: crop out of bounds [{x}:{x+w}, {y}:{y+h}] for image {image_width}x{image_height}")
                    continue

                col_img = img_cv[y:y + h, x:x + w]
                column_file = output_dir_for_image / f'column_{idx + 1}.png'
                success = cv2.imwrite(str(column_file), col_img)
                if success:
                    print(f"Saved cropped column {idx + 1} to {column_file}")
                    columns_metadata[idx]["saved_path"] = str(column_file) # Сохраняем путь
                else:
                    print(f"Failed to save cropped column {idx + 1} to {column_file}")
        elif not actual_image_loaded:
            print("Skipping column saving: actual image not loaded.") # Добавлено логирование
        else:
            print("Skipping column saving: no column metadata generated.") # Добавлено логирование
    except Exception as e:
        print(f"Error while saving cropped columns: {e}")

    return columns_metadata

# --- Helper function placeholders (would need actual implementation with an image library) ---

# def load_actual_image(src: str):
#     # Placeholder: Use a library like Pillow (PIL)
#     # from PIL import Image
#     # try:
#     #     img = Image.open(src)
#     #     return {
#     #         "width": img.width,
#     #         "height": img.height,
#     #         "pil_image": img  # Store the Pillow image object for further processing
#     #     }
#     # except FileNotFoundError:
#     #     print(f"Error: Image file not found at {src}")
#     #     return None
#     # except Exception as e:
#     #     print(f"Error loading image '{src}': {e}")
#     #     return None
#     print(f"Conceptual: Would load actual image from {src} using a library like Pillow.")
#     return None # Must be implemented

# def crop_actual_image(pil_image_obj, x: int, y: int, width: int, height: int):
#     # Placeholder: Use a library's crop function
#     # cropped_img = pil_image_obj.crop((x, y, x + width, y + height))
#     # return cropped_img # or bytes, or save to a temp file
#     print(f"Conceptual: Would crop image data at x={x}, y={y}, width={width}, height={height}")
#     return {"data": "placeholder_cropped_image_data_bytes_or_object"} # Must be implemented

# Example usage
def main():
    # IMPORTANT: This path MUST point to an existing image file for OpenCV to work.
    image_path_str = '/workspaces/allcodespaces/figmar/figma_data/sfBOYWVpWlJvYZyI7g6MxD/images/node_48_1883.png'

    image_path_obj = Path(image_path_str)
    if not image_path_obj.exists():
        print(f"CRITICAL ERROR: Image file not found at {image_path_str}. Cannot proceed to save actual image crops.")
        return

    # Load the original image with OpenCV for cropping later
    original_cv_image = cv2.imread(image_path_str)
    if original_cv_image is None:
        print(f"CRITICAL ERROR: Failed to load image {image_path_str} with OpenCV. Cannot save actual image crops.")
        return
    
    actual_img_h, actual_img_w = original_cv_image.shape[:2]
    print(f"Main: Successfully loaded original image for cropping: {actual_img_w}x{actual_img_h}")

    image_name_without_ext = image_path_obj.stem
    base_output_dir = Path('./columns_py_opencv_actual_images') 
    output_dir_for_image = base_output_dir / image_name_without_ext

    print(f"Base output directory: {base_output_dir}")
    print(f"Output directory for this image: {output_dir_for_image}")

    try:
        output_dir_for_image.mkdir(parents=True, exist_ok=True)
        print(f"Ensured directory exists: {output_dir_for_image}")
    except OSError as e:
        print(f"Error creating directory {output_dir_for_image}: {e}")
        return

    fixed_expected_columns = 5
    # Pass actual dimensions as mocks, split_image_intellectually will prefer its own loaded dimensions if successful
    # but these serve as a fallback if its internal load fails, ensuring consistency with the image loaded in main.
    columns = split_image_intellectually(
        image_path_str,
        screen_width_threshold=800, 
        expected_columns=fixed_expected_columns,
        mock_image_width=actual_img_w, # Use actual width from main's loaded image
        mock_image_height=actual_img_h  # Use actual height from main's loaded image
    )

    if columns:
        # Determine if the image was considered "split"
        # This logic might need refinement based on how `split_image_intellectually` returns data
        # For fixed_expected_columns > 1, it should always be considered split if successful.
        is_split = len(columns) > 1 or \
                   (len(columns) == 1 and fixed_expected_columns == 1) or \
                   (len(columns) == 1 and columns[0]['width'] < actual_img_w)


        if is_split and len(columns) > 0 : # Ensure there's at least one column definition
            print(f"Image conceptually split into {len(columns)} columns. Saving actual image files.")
            for idx, col_meta in enumerate(columns):
                column_file_name = f"column_{idx + 1}.png" 
                column_save_path = output_dir_for_image / column_file_name
                
                x, y, w, h = col_meta['x'], col_meta['y'], col_meta['width'], col_meta['height']
                
                # Ensure crop dimensions are valid for the original_cv_image
                if x < 0 or y < 0 or x + w > actual_img_w or y + h > actual_img_h:
                    print(f"Warning: Column {idx+1} crop dimensions [{x}:{x+w}, {y}:{y+h}] are out of bounds for image size {actual_img_w}x{actual_img_h}. Skipping.")
                    continue
                if w <= 0 or h <= 0:
                    print(f"Warning: Column {idx+1} crop dimensions width={w} or height={h} are invalid. Skipping.")
                    continue

                print(f"Cropping Column {idx + 1}: x={x}, y={y}, width={w}, height={h}")
                
                # Crop the image using NumPy slicing
                # Ensure col_meta['height'] is used, as it's what split_image_intellectually decided upon
                roi = original_cv_image[y : y + col_meta['height'], x : x + w]
                
                try:
                    cv2.imwrite(str(column_save_path), roi)
                    print(f"Saved cropped image for column {idx + 1} to {column_save_path}")
                except Exception as e: # Catch potential OpenCV errors during imwrite
                    print(f"Error saving cropped image {column_save_path}: {e}")

        elif len(columns) == 1: # Handles the case where the image is treated as a single segment
             print("Image treated as a single segment. Saving actual image file.")
             col_meta = columns[0]
             single_file_name = f"{image_name_without_ext}_single_segment.png"
             single_save_path = output_dir_for_image / single_file_name
             
             x, y, w, h = col_meta['x'], col_meta['y'], col_meta['width'], col_meta['height']

             if x < 0 or y < 0 or x + w > actual_img_w or y + h > actual_img_h:
                 print(f"Warning: Single segment crop dimensions [{x}:{x+w}, {y}:{y+h}] are out of bounds. Skipping.")
             elif w <= 0 or h <= 0:
                 print(f"Warning: Single segment crop dimensions width={w} or height={h} are invalid. Skipping.")
             else:
                print(f"Cropping single segment: x={x}, y={y}, width={w}, height={h}")
                roi = original_cv_image[y : y + col_meta['height'], x : x + w]
                try:
                    cv2.imwrite(str(single_save_path), roi)
                    print(f"Saved single image segment to {single_save_path}")
                except Exception as e:
                    print(f"Error saving single image segment {single_save_path}: {e}")
    else:
        print("No column metadata was generated by split_image_intellectually.")

if __name__ == "__main__":
    main()
