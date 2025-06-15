document.addEventListener('DOMContentLoaded', () => {
    const contractUploadInput = document.getElementById('contract-upload');
    const analyzeButton = document.getElementById('analyze-button');
    const contractTextDisplayDiv = document.getElementById('contract-text-display');
    const analysisPanel = document.getElementById('analysis-results');
    const analysisProgressDiv = document.getElementById('analysis-progress');
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');

    // Элементы, которые могут отсутствовать на SEO-страницах или управляться видимостью
    const mainContentSection = document.getElementById('main-content'); 
    const uploadSection = document.getElementById('upload-section');

    let currentAnalysisData = null; 
    let currentFullContractTextMd = ""; 
    let pollingIntervalId = null; 
    let currentAnalysisTaskId = null; 
    let currentSelectedParagraphIndex = null;

    // Глобальные переменные, устанавливаемые из шаблона index_template.html
    // window.isSeoPage (boolean)
    // window.mainKeyword (string or null)
    // window.seoPageContractTextRaw (stringified JSON or null)
    // window.seoPageAnalysisDataRaw (stringified JSON or null)

    // Функция для сброса состояния прогресс-бара
    function resetProgressBar() {
        if (analysisProgressDiv) analysisProgressDiv.textContent = '';
        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.textContent = '0%';
        }
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    }

    // Функция для обновления прогресс-бара
    function updateProgressBar(processed, total, percentage, statusText) {
        if (progressBarContainer) progressBarContainer.style.display = 'block';
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.textContent = `${percentage}%`;
        }
        if (analysisProgressDiv) analysisProgressDiv.textContent = statusText;
    }

    // Функция для отображения текста договора и его анализа
    // Эта функция теперь универсальна для главной страницы и SEO-страниц
    function displayContractAndAnalysis(contractTextMd, analysisResults) {
        console.log('displayContractAndAnalysis: Начало отображения. contractTextMd (первые 100):', contractTextMd ? contractTextMd.substring(0,100) : "N/A", 'analysisResults:', analysisResults);
        
        if (contractTextDisplayDiv) contractTextDisplayDiv.innerHTML = ''; // Очищаем предыдущий текст
        // Устанавливаем начальный текст панели анализа, который будет заменен, если есть анализ
        if (analysisPanel) analysisPanel.innerHTML = '<p>Анализ не загружен или отсутствует.</p>'; 
        currentFullContractTextMd = contractTextMd || ""; // Сохраняем полный текст, если он нужен где-то еще

        // Сохраняем данные анализа ПЕРЕД отображением, чтобы использовать их для создания сегментов
        if (analysisResults && analysisResults.length > 0) {
            currentAnalysisData = analysisResults;
            console.log('displayContractAndAnalysis: Анализ данных загружен:', currentAnalysisData);
        } else {
            console.warn('displayContractAndAnalysis: analysisResults пуст или некорректен. Сегменты и анализ могут отсутствовать.');
            currentAnalysisData = [];
        }

        // Отображаем сегменты на основе analysisResults
        if (currentAnalysisData.length > 0) {
            currentAnalysisData.forEach((analysisItem, index) => {
                const span = document.createElement('span');
                span.classList.add('contract-paragraph');
                span.dataset.paragraphIndex = index;
                // Используем 'paragraph' из analysisItem для текста сегмента
                span.textContent = (analysisItem.paragraph || analysisItem.original_paragraph || `Пункт ${index + 1} (текст не найден)`) + ' '; // Добавлен пробел
                
                span.addEventListener('mouseover', () => highlightParagraphAndShowAnalysis(index));
                span.addEventListener('mouseout', () => removeHighlightAndShowDefault(index)); // Изменено
                span.addEventListener('click', () => selectParagraph(index)); // Добавлен обработчик клика
                
                if (contractTextDisplayDiv) contractTextDisplayDiv.appendChild(span);
            });

            // Добавляем обработчик клика на сам контейнер для "открепления"
            if (contractTextDisplayDiv) {
                contractTextDisplayDiv.addEventListener('click', (event) => {
                    // Если клик был не на параграфе, сбрасываем выбор
                    if (!event.target.classList.contains('contract-paragraph')) {
                        currentSelectedParagraphIndex = null;
                        highlightParagraph(-1); // Снимаем подсветку со всех
                        if (currentAnalysisData && currentAnalysisData.length > 0) {
                            showParagraphAnalysis(0); // Показываем анализ первого пункта по умолчанию
                        } else {
                            analysisPanel.innerHTML = '<p>Наведите курсор на абзац слева, чтобы увидеть его анализ.</p>';
                        }
                    }
                });
            }

            // Отображаем анализ первого пункта по умолчанию, если нет выбранного
            if (currentSelectedParagraphIndex === null) {
                showParagraphAnalysis(0); 
            } else {
                // Если есть выбранный, показываем его анализ
                showParagraphAnalysis(currentSelectedParagraphIndex);
                highlightParagraph(currentSelectedParagraphIndex); // Подсвечиваем выбранный
            }
        } else if (currentFullContractTextMd) {
            // Если анализа нет, но есть текст договора, отображаем его как один блок (старое поведение как fallback)
            // Это может быть полезно, если анализ еще не пришел, но текст уже есть
            const p = document.createElement('p');
            p.textContent = currentFullContractTextMd;
            if (contractTextDisplayDiv) contractTextDisplayDiv.appendChild(p);
            if (analysisPanel) analysisPanel.innerHTML = '<p>Анализ для этого договора отсутствует или еще не загружен.</p>';
        } else {
            if (contractTextDisplayDiv) contractTextDisplayDiv.innerHTML = '<p>Текст договора не загружен.</p>';
        }

        // Для главной страницы, где есть секции upload/main-content
        if (mainContentSection && uploadSection) {
            mainContentSection.style.display = 'flex';
            uploadSection.style.display = 'block';
        }
        console.log('displayContractAndAnalysis: Отображение завершено.');
    }

    // Функция для подсветки конкретного абзаца
    function highlightParagraph(index) {
        if (!contractTextDisplayDiv) return;
        const paragraphElements = contractTextDisplayDiv.querySelectorAll('.contract-paragraph');
        paragraphElements.forEach((el, i) => {
            if (i === index) {
                el.style.backgroundColor = '#e6f7ff'; // Цвет подсветки
            } else {
                el.style.backgroundColor = 'transparent';
            }
        });
    }

    // Подсветка абзаца и отображение анализа при наведении
    function highlightParagraphAndShowAnalysis(index) {
        // Если есть выбранный параграф, не меняем подсветку и анализ при наведении
        if (currentSelectedParagraphIndex !== null) {
            return;
        }
        highlightParagraph(index);
        showParagraphAnalysis(index);
    }

    // Удаление подсветки и отображение анализа по умолчанию при убирании курсора
    function removeHighlightAndShowDefault(index) {
        // Если есть выбранный параграф, не убираем подсветку и не меняем анализ
        if (currentSelectedParagraphIndex !== null) {
            return;
        }
        highlightParagraph(-1); // Убираем подсветку со всех
        // Показываем анализ первого пункта по умолчанию
        if (currentAnalysisData && currentAnalysisData.length > 0) {
            showParagraphAnalysis(0); 
        } else {
            if (analysisPanel) analysisPanel.innerHTML = '<p>Наведите курсор на абзац слева, чтобы увидеть его анализ.</p>';
        }
    }

    // Функция для выбора (клика) параграфа
    function selectParagraph(index) {
        currentSelectedParagraphIndex = index;
        highlightParagraph(index); // Подсвечиваем выбранный
        showParagraphAnalysis(index); // Показываем его анализ
    }

    // Отображение анализа конкретного абзаца
    function showParagraphAnalysis(index) {
        if (!analysisPanel) return; 
        analysisPanel.innerHTML = ''; // Очищаем панель
        if (currentAnalysisData && currentAnalysisData[index]) {
            const analysisItem = currentAnalysisData[index];
            // Используем 'paragraph' или 'original_paragraph' из данных анализа
            const paragraphText = analysisItem.paragraph || analysisItem.original_paragraph || `Текст пункта ${index + 1} не найден`;
            const analysisText = analysisItem.analysis;

            analysisPanel.innerHTML = `
                <h3>Анализ пункта/абзаца ${index + 1}:</h3>
                <p><strong>Пункт/абзац:</strong></p>
                <div style="white-space: pre-wrap; word-wrap: break-word; max-height: 100px; overflow-y: auto; border: 1px solid #eee; padding: 5px; margin-bottom: 10px;">${paragraphText}</div>
                <p><strong>Анализ:</strong></p>
                <div style="white-space: pre-wrap; word-wrap: break-word;">${analysisText}</div>
            `;
        } else {
            analysisPanel.innerHTML = `<p>Анализ для этого пункта/абзаца отсутствует или данные не загружены.</p>`;
        }
    }

    // Функция для запуска анализа и опроса статуса
    async function startAnalysisAndPollStatus(contractTextMd) {
        // Если уже есть активная задача, очищаем предыдущий интервал опроса
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
        resetProgressBar();
        if (analysisProgressDiv) analysisProgressDiv.textContent = 'Запуск анализа...';
        if (analysisPanel) analysisPanel.innerHTML = '<p>Анализ в процессе. Пожалуйста, подождите...</p>';

        try {
            const startResponse = await fetch('/api/v1/start_analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_contract_text: contractTextMd }),
            });
            const startData = await startResponse.json();

            if (startData.error) {
                console.error('Ошибка при запуске анализа:', startData.error);
                if (analysisProgressDiv) analysisProgressDiv.textContent = `Ошибка: ${startData.error}`;
                if (analysisPanel) analysisPanel.innerHTML = `<p>Ошибка при запуске анализа: ${startData.error}</p>`;
                return;
            }

            currentAnalysisTaskId = startData.task_id; // Сохраняем ID текущей задачи
            console.log('Анализ запущен, Task ID:', currentAnalysisTaskId);

            // Если бэкенд вернул статус COMPLETED или PROCESSING/PENDING (т.е. задача уже активна или завершена)
            if (startData.status === "COMPLETED") {
                console.log("Анализ уже был в кэше, отображаем результаты.");
                displayContractAndAnalysis(contractTextMd, startData.results.analysis_results);
                resetProgressBar();
                return;
            } else if (startData.status === "PROCESSING" || startData.status === "PENDING") {
                console.log(`Анализ уже в процессе (Task ID: ${currentAnalysisTaskId}). Начинаем опрос статуса.`);
                // Продолжаем опрос существующей задачи
                // Прогресс будет обновлен первым же запросом get_analysis_status
            }

            // Начинаем опрос статуса
            pollingIntervalId = setInterval(async () => {
                const statusResponse = await fetch(`/api/v1/get_analysis_status/${currentAnalysisTaskId}`);
                const statusData = await statusResponse.json();

                if (statusData.error) {
                    console.error('Ошибка при получении статуса:', statusData.error);
                    clearInterval(pollingIntervalId);
                    pollingIntervalId = null;
                    if (analysisProgressDiv) analysisProgressDiv.textContent = `Ошибка: ${statusData.error}`;
                    if (analysisPanel) analysisPanel.innerHTML = `<p>Ошибка при получении статуса: ${statusData.error}</p>`;
                    return;
                }

                const { status, processed_items, total_items, progress_percentage, results, error } = statusData; // Изменено
                let statusText = `Статус: ${status}`;

                if (status === "PROCESSING" || status === "PENDING") {
                    statusText = `Прогресс: ${processed_items} из ${total_items} пунктов (${progress_percentage}%)`; // Изменено
                    updateProgressBar(processed_items, total_items, progress_percentage, statusText); // Изменено
                } else if (status === "COMPLETED") {
                    clearInterval(pollingIntervalId);
                    pollingIntervalId = null;
                    statusText = `Анализ завершен: ${processed_items} из ${total_items} пунктов (100%)`; // Изменено
                    updateProgressBar(processed_items, total_items, 100, statusText); // Изменено
                    console.log('Анализ завершен, результаты:', results);
                    displayContractAndAnalysis(contractTextMd, results.analysis_results);
                } else if (status === "FAILED") {
                    clearInterval(pollingIntervalId);
                    pollingIntervalId = null;
                    statusText = `Анализ провален: ${error}`;
                    if (analysisProgressDiv) analysisProgressDiv.textContent = statusText;
                    if (analysisPanel) analysisPanel.innerHTML = `<p>Анализ провален: ${error}</p>`;
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                }
            }, 3000); // Опрашиваем каждые 3 секунды (увеличено с 2 секунд)

        } catch (error) {
            console.error('Критическая ошибка при запуске анализа или опросе:', error);
            if (analysisProgressDiv) analysisProgressDiv.textContent = `Критическая ошибка: ${error.message}`;
            if (analysisPanel) analysisPanel.innerHTML = `<p>Критическая ошибка: ${error.message}</p>`;
            if (pollingIntervalId) {
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
            }
        }
    }

    // Загрузка и отображение примера договора при старте
    async function loadSampleContract() {
        try {
            console.log('loadSampleContract: Запрос примера договора...');
            const response = await fetch('/api/v1/get_sample_contract');
            const data = await response.json();

            if (data.error || !data.contract_text) {
                console.error('loadSampleContract: Ошибка загрузки примера договора:', data.error || 'Текст не получен');
                if (contractTextDisplayDiv) contractTextDisplayDiv.textContent = 'Не удалось загрузить пример договора.';
                if (analysisPanel) analysisPanel.textContent = '';
                return;
            }

            const sampleContractText = data.contract_text;
            console.log('loadSampleContract: Получен текст примера договора (первые 200 символов):', sampleContractText.substring(0, 200));
            
            // Отображаем текст сразу
            // displayContractAndAnalysis(sampleContractText, []); // Убрано, т.к. анализ запускается ниже и сам вызовет display
            
            // Запускаем асинхронный анализ, который в случае успеха вызовет displayContractAndAnalysis с результатами
            startAnalysisAndPollStatus(sampleContractText);

        } catch (error) {
            console.error('loadSampleContract: Критическая ошибка при загрузке примера:', error);
            if (contractTextDisplayDiv) contractTextDisplayDiv.textContent = 'Критическая ошибка при загрузке примера договора.';
            if (analysisPanel) analysisPanel.innerHTML = `<p>Произошла ошибка: ${error.message}</p>`;
        }
    }

    // Инициализация при загрузке страницы
    // Проверяем, есть ли параметр 'test' в URL или данные для SEO-страницы
    const urlParams = new URLSearchParams(window.location.search);
    const testFileName = urlParams.get('test');

    if (testFileName) {
        console.log('Обнаружен параметр test в URL:', testFileName);
        loadTestContractAndAnalyze(testFileName);
    } else if (window.seoPageAnalysisDataRaw || window.seoPageContractTextRaw) { // Изменено на OR, чтобы обрабатывать даже если одно из полей пустое
        // Если это SEO-страница и данные уже встроены в HTML
        console.log('Обнаружены данные для SEO-страницы. Декодируем и отображаем встроенный анализ.');
        try {
            // Данные из window.seoPageContractTextRaw и window.seoPageAnalysisDataRaw уже должны быть валидными JSON строками или null
            // decodeURIComponent не нужен, если данные правильно переданы через tojson | safe
            const contractTextForSeo = window.seoPageContractTextRaw ? JSON.parse(window.seoPageContractTextRaw) : "";
            const analysisDataForSeo = window.seoPageAnalysisDataRaw ? JSON.parse(window.seoPageAnalysisDataRaw) : null;
            
            // Убедимся, что analysisDataForSeo.paragraphs или analysisDataForSeo.analysis_results используются
            let resultsArray = [];
            if (analysisDataForSeo) {
                if (Array.isArray(analysisDataForSeo.paragraphs)) {
                    resultsArray = analysisDataForSeo.paragraphs;
                } else if (Array.isArray(analysisDataForSeo.analysis_results)) { // Для совместимости со старым форматом
                    resultsArray = analysisDataForSeo.analysis_results;
                } else if (Array.isArray(analysisDataForSeo)) { // Если сам объект является массивом результатов
                     resultsArray = analysisDataForSeo;
                }
            }
            
            console.log('SEO Page: Contract Text:', contractTextForSeo ? contractTextForSeo.substring(0,100) : "N/A");
            console.log('SEO Page: Analysis Data (processed):', resultsArray);

            if (contractTextForSeo) {
                 // Если есть текст договора, но нет анализа (например, анализ "на лету" еще не завершен бэкендом)
                 // или если анализ уже есть, отображаем его.
                if (resultsArray && resultsArray.length > 0) {
                    displayContractAndAnalysis(contractTextForSeo, resultsArray);
                } else {
                    // Если текст есть, а анализа нет (например, для SEO-страниц, где анализ делается "на лету" и может быть еще не готов)
                    // Запускаем startAnalysisAndPollStatus, который отобразит текст и будет ждать анализ
                    // Это также обработает случай, если анализ уже в кэше на бэкенде.
                    startAnalysisAndPollStatus(contractTextForSeo);
                }
            } else {
                console.warn('SEO Page: Текст договора отсутствует, загрузка примера не предусмотрена для SEO страниц с ошибками данных.');
                if(contractTextDisplayDiv) contractTextDisplayDiv.innerHTML = "<p>Ошибка: Текст договора для этой страницы не найден.</p>";
                if(analysisPanel) analysisPanel.innerHTML = "<p>Анализ невозможен без текста договора.</p>";
            }

        } catch (e) {
            console.error('Ошибка при обработке данных SEO-страницы:', e);
            if(contractTextDisplayDiv) contractTextDisplayDiv.innerHTML = `<p>Ошибка при загрузке данных страницы: ${e.message}</p>`;
            if(analysisPanel) analysisPanel.innerHTML = "";
        }
    } else if (testFileName) {
        console.log('Обнаружен параметр test в URL:', testFileName);
        loadTestContractAndAnalyze(testFileName);
    } else {
        // Обычная главная страница, не SEO и не тестовый режим
        loadSampleContract();
    }

    async function loadTestContractAndAnalyze(fileName) {
        try {
            console.log(`loadTestContractAndAnalyze: Запрос данных для тестового файла: ${fileName}`);
            // Запрос на специальный эндпоинт, который вернет только текст договора
            const response = await fetch(`/api/v1/get_test_contract?file=${encodeURIComponent(fileName)}`);
            const data = await response.json();

            if (data.error) {
                console.error(`loadTestContractAndAnalyze: Ошибка загрузки тестового файла ${fileName}:`, data.error);
                if (contractTextDisplayDiv) contractTextDisplayDiv.textContent = `Не удалось загрузить тестовый файл: ${fileName}. Ошибка: ${data.error}`;
                if (analysisPanel) analysisPanel.textContent = '';
                if (mainContentSection) mainContentSection.style.display = 'flex';
                if (uploadSection) uploadSection.style.display = 'block';
                return;
            }
            
            const contractTextMd = data.contract_text; // Изменено с contract_text_md на contract_text

            if (contractTextMd) {
                // displayContractAndAnalysis(contractTextMd, []); // Убрано, т.к. анализ запускается ниже и сам вызовет display
                startAnalysisAndPollStatus(contractTextMd); // Запускаем анализ, который в случае успеха вызовет displayContractAndAnalysis
            } else {
                 console.error(`loadTestContractAndAnalyze: Отсутствует текст договора для тестового файла ${fileName}`);
                if (contractTextDisplayDiv) contractTextDisplayDiv.textContent = `Текст договора для тестового файла ${fileName} не найден.`;
                if (analysisPanel) analysisPanel.textContent = '';
            }

        } catch (error) {
            console.error(`loadTestContractAndAnalyze: Критическая ошибка при загрузке тестового файла ${fileName}:`, error);
            if (contractTextDisplayDiv) contractTextDisplayDiv.textContent = `Критическая ошибка при обработке тестового файла: ${fileName}.`;
            if (analysisPanel) analysisPanel.innerHTML = `<p>Произошла ошибка: ${error.message}</p>`;
        }
    }


    // Обработчик кнопки "Анализировать" для пользовательских файлов
    if (analyzeButton) {
        analyzeButton.addEventListener('click', async () => {
            const file = contractUploadInput.files[0];
            if (!file) {
                alert('Пожалуйста, выберите файл для загрузки.');
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                console.log('analyzeButton: Отправка файла на загрузку...');
                // 1. Загрузка файла
                const uploadResponse = await fetch('/api/v1/upload_contract', {
                    method: 'POST',
                    body: formData,
                });
                const uploadData = await uploadResponse.json();

                if (uploadData.error) {
                    console.error('analyzeButton: Ошибка загрузки файла:', uploadData.error);
                    alert('Ошибка загрузки файла: ' + uploadData.error);
                    if (contractTextDisplayDiv) contractTextDisplayDiv.textContent = 'Ошибка при загрузке файла.';
                    if (analysisPanel) analysisPanel.innerHTML = `<p>Ошибка: ${uploadData.error}</p>`;
                    return;
                }
                
                const uploadedContractText = uploadData.contract_text;
                console.log('analyzeButton: Получен текст загруженного договора (первые 200 символов):', uploadedContractText.substring(0, 200));
                
                // Отображаем текст сразу
                // displayContractAndAnalysis(uploadedContractText, []); // Убрано, т.к. анализ запускается ниже и сам вызовет display

                // Запускаем асинхронный анализ, который в случае успеха вызовет displayContractAndAnalysis
                startAnalysisAndPollStatus(uploadedContractText);

            } catch (error) {
                console.error('analyzeButton: Критическая ошибка при загрузке/анализе файла:', error);
                alert('Критическая ошибка при загрузке или анализе файла: ' + error.message);
                if (contractTextDisplayDiv) contractTextDisplayDiv.textContent = 'Ошибка при обработке файла.';
                if (analysisPanel) analysisPanel.innerHTML = `<p>Произошла ошибка: ${error.message}</p>`;
            }
        });
    }
});
