document.addEventListener('DOMContentLoaded', () => {
    const contractUploadInput = document.getElementById('contract-upload');
    const analyzeButton = document.getElementById('analyze-button');
    const contractTextDisplayDiv = document.getElementById('contract-text-display');
    const analysisResultsDiv = document.getElementById('analysis-results');
    const mainContentSection = document.getElementById('main-content');
    const uploadSection = document.getElementById('upload-section');
    const analysisProgressDiv = document.getElementById('analysis-progress'); // Новый элемент для текста прогресса
    const progressBarContainer = document.getElementById('progress-bar-container'); // Контейнер прогресс-бара
    const progressBar = document.getElementById('progress-bar'); // Сам прогресс-бар

    let currentContractSentences = []; // Для хранения предложений текущего договора
    let currentAnalysisData = null; // Для хранения результатов анализа (объект или массив)
    let currentFullContractTextMd = ""; // Для хранения полного текста договора в Markdown
    let pollingIntervalId = null; // Для хранения ID интервала опроса
    let currentAnalysisTaskId = null; // Для отслеживания ID текущей активной задачи анализа

    // Функция для сброса состояния прогресс-бара
    function resetProgressBar() {
        analysisProgressDiv.textContent = '';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        progressBarContainer.style.display = 'none';
    }

    // Функция для обновления прогресс-бара
    function updateProgressBar(processed, total, percentage, statusText) {
        progressBarContainer.style.display = 'block';
        progressBar.style.width = `${percentage}%`;
        progressBar.textContent = `${percentage}%`;
        analysisProgressDiv.textContent = statusText;
    }

    // Функция для отображения текста договора и его анализа
    function displayContractAndAnalysis(contractTextMd, analysisResults) {
        console.log('displayContractAndAnalysis: Начало отображения. contractTextMd (первые 100):', contractTextMd ? contractTextMd.substring(0,100) : "N/A", 'analysisResults:', analysisResults);
        contractTextDisplayDiv.innerHTML = ''; // Очищаем предыдущий текст
        analysisResultsDiv.innerHTML = ''; // Очищаем предыдущий анализ
        currentFullContractTextMd = contractTextMd || "";

        if (currentFullContractTextMd) {
            const paragraphs = currentFullContractTextMd.split('\n').filter(p => p.trim() !== '');
            paragraphs.forEach(paraText => {
                const p = document.createElement('p');
                p.textContent = paraText;
                contractTextDisplayDiv.appendChild(p);
            });
        } else {
            contractTextDisplayDiv.innerHTML = '<p>Текст договора не загружен.</p>';
        }

        if (!analysisResults || analysisResults.length === 0) {
            console.warn('displayContractAndAnalysis: analysisResults пуст или некорректен.');
            analysisResultsDiv.innerHTML = `<p>Анализ для этого договора не найден, не загружен или содержит ошибки.</p>`;
            if (currentFullContractTextMd) {
                currentContractSentences = currentFullContractTextMd.split('\n').filter(s => s.trim().length > 5);
                currentAnalysisData = currentContractSentences.map(sentence => ({ sentence, analysis: "Анализ не удался или отсутствует." }));

                contractTextDisplayDiv.innerHTML = '';
                currentContractSentences.forEach((sentence, index) => {
                    const p = document.createElement('p');
                    p.textContent = sentence;
                    p.dataset.sentenceIndex = index;
                    p.addEventListener('mouseover', () => highlightSentenceAndShowAnalysis(index));
                    p.addEventListener('mouseout', () => removeHighlight(index));
                    contractTextDisplayDiv.appendChild(p);
                });
                if (currentAnalysisData.length > 0) showSentenceAnalysis(0);
            }
        } else {
            currentContractSentences = analysisResults.map(item => item.sentence);
            currentAnalysisData = analysisResults;

            console.log('displayContractAndAnalysis: Предложения для отображения из анализа:', currentContractSentences);

            contractTextDisplayDiv.innerHTML = '';
            currentContractSentences.forEach((sentence, index) => {
                const p = document.createElement('p');
                p.textContent = sentence;
                p.dataset.sentenceIndex = index;
                p.addEventListener('mouseover', () => highlightSentenceAndShowAnalysis(index));
                p.addEventListener('mouseout', () => removeHighlight(index));
                contractTextDisplayDiv.appendChild(p);
            });

            if (currentAnalysisData && currentAnalysisData.length > 0) {
                showSentenceAnalysis(0);
            } else {
                analysisResultsDiv.innerHTML = `<p>Анализ для этого договора не найден или еще не загружен.</p>`;
            }
        }

        mainContentSection.style.display = 'flex';
        uploadSection.style.display = 'block';
        console.log('displayContractAndAnalysis: Отображение завершено.');
    }

    function highlightSentenceAndShowAnalysis(index) {
        const sentenceElements = contractTextDisplayDiv.querySelectorAll('p');
        sentenceElements.forEach((el, i) => {
            if (i === index) {
                el.style.backgroundColor = '#e6f7ff';
            } else {
                el.style.backgroundColor = 'transparent';
            }
        });
        showSentenceAnalysis(index);
    }

    function removeHighlight(index) {
        // const sentenceElement = contractTextDisplayDiv.querySelector(`p[data-sentence-index="${index}"]`);
        // if (sentenceElement) {
        //     sentenceElement.style.backgroundColor = 'transparent';
        // }
    }

    function showSentenceAnalysis(index) {
        analysisResultsDiv.innerHTML = '';
        if (currentAnalysisData && currentAnalysisData[index]) {
            const analysisItem = currentAnalysisData[index];
            let sentenceText = currentContractSentences[index];
            let analysisText = "";

            if (typeof analysisItem === 'string') {
                analysisText = analysisItem;
            } else if (typeof analysisItem === 'object' && analysisItem.analysis) {
                sentenceText = analysisItem.sentence || sentenceText;
                analysisText = analysisItem.analysis;
            } else {
                analysisText = "Формат анализа не распознан.";
            }

            analysisResultsDiv.innerHTML = `
                <h3>Анализ предложения ${index + 1}:</h3>
                <p><strong>Предложение:</strong> ${sentenceText}</p>
                <p><strong>Анализ:</strong></p>
                <div>${analysisText}</div>
            `;
        } else {
            analysisResultsDiv.innerHTML = `<p>Анализ для этого предложения отсутствует.</p>`;
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
        analysisProgressDiv.textContent = 'Запуск анализа...';
        analysisResultsDiv.innerHTML = '<p>Анализ в процессе. Пожалуйста, подождите...</p>';

        try {
            const startResponse = await fetch('/api/v1/start_analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_contract_text: contractTextMd }),
            });
            const startData = await startResponse.json();

            if (startData.error) {
                console.error('Ошибка при запуске анализа:', startData.error);
                analysisProgressDiv.textContent = `Ошибка: ${startData.error}`;
                analysisResultsDiv.innerHTML = `<p>Ошибка при запуске анализа: ${startData.error}</p>`;
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
                    analysisProgressDiv.textContent = `Ошибка: ${statusData.error}`;
                    analysisResultsDiv.innerHTML = `<p>Ошибка при получении статуса: ${statusData.error}</p>`;
                    return;
                }

                const { status, processed_sentences, total_sentences, progress_percentage, results, error } = statusData;
                let statusText = `Статус: ${status}`;

                if (status === "PROCESSING" || status === "PENDING") {
                    statusText = `Прогресс: ${processed_sentences} из ${total_sentences} предложений (${progress_percentage}%)`;
                    updateProgressBar(processed_sentences, total_sentences, progress_percentage, statusText);
                } else if (status === "COMPLETED") {
                    clearInterval(pollingIntervalId);
                    pollingIntervalId = null;
                    statusText = `Анализ завершен: ${processed_sentences} из ${total_sentences} предложений (100%)`;
                    updateProgressBar(processed_sentences, total_sentences, 100, statusText);
                    console.log('Анализ завершен, результаты:', results);
                    displayContractAndAnalysis(contractTextMd, results.analysis_results);
                } else if (status === "FAILED") {
                    clearInterval(pollingIntervalId);
                    pollingIntervalId = null;
                    statusText = `Анализ провален: ${error}`;
                    analysisProgressDiv.textContent = statusText;
                    analysisResultsDiv.innerHTML = `<p>Анализ провален: ${error}</p>`;
                    progressBarContainer.style.display = 'none';
                }
            }, 3000); // Опрашиваем каждые 3 секунды (увеличено с 2 секунд)

        } catch (error) {
            console.error('Критическая ошибка при запуске анализа или опросе:', error);
            analysisProgressDiv.textContent = `Критическая ошибка: ${error.message}`;
            analysisResultsDiv.innerHTML = `<p>Критическая ошибка: ${error.message}</p>`;
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
                contractTextDisplayDiv.textContent = 'Не удалось загрузить пример договора.';
                analysisResultsDiv.textContent = '';
                return;
            }

            const sampleContractText = data.contract_text;
            console.log('loadSampleContract: Получен текст примера договора (первые 200 символов):', sampleContractText.substring(0, 200));
            
            // Отображаем текст сразу
            displayContractAndAnalysis(sampleContractText, []); // Пока без анализа
            
            // Запускаем асинхронный анализ
            startAnalysisAndPollStatus(sampleContractText);

        } catch (error) {
            console.error('loadSampleContract: Критическая ошибка при загрузке примера:', error);
            contractTextDisplayDiv.textContent = 'Критическая ошибка при загрузке примера договора.';
            analysisResultsDiv.innerHTML = `<p>Произошла ошибка: ${error.message}</p>`;
        }
    }

    // Инициализация при загрузке страницы
    // Проверяем, есть ли параметр 'test' в URL
    const urlParams = new URLSearchParams(window.location.search);
    const testFileName = urlParams.get('test');

    if (testFileName) {
        console.log('Обнаружен параметр test в URL:', testFileName);
        // Если есть параметр test, загружаем файл и запускаем анализ
        loadTestContractAndAnalyze(testFileName);
    } else {
        // Иначе загружаем обычный пример договора
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
                contractTextDisplayDiv.textContent = `Не удалось загрузить тестовый файл: ${fileName}. Ошибка: ${data.error}`;
                analysisResultsDiv.textContent = '';
                mainContentSection.style.display = 'flex';
                uploadSection.style.display = 'block';
                return;
            }
            
            const contractTextMd = data.contract_text; // Изменено с contract_text_md на contract_text

            if (contractTextMd) {
                displayContractAndAnalysis(contractTextMd, []); // Отображаем текст сразу
                startAnalysisAndPollStatus(contractTextMd); // Запускаем анализ
            } else {
                 console.error(`loadTestContractAndAnalyze: Отсутствует текст договора для тестового файла ${fileName}`);
                contractTextDisplayDiv.textContent = `Текст договора для тестового файла ${fileName} не найден.`;
                analysisResultsDiv.textContent = '';
            }

        } catch (error) {
            console.error(`loadTestContractAndAnalyze: Критическая ошибка при загрузке тестового файла ${fileName}:`, error);
            contractTextDisplayDiv.textContent = `Критическая ошибка при обработке тестового файла: ${fileName}.`;
            analysisResultsDiv.innerHTML = `<p>Произошла ошибка: ${error.message}</p>`;
        }
    }


    // Обработчик кнопки "Анализировать" для пользовательских файлов
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
                contractTextDisplayDiv.textContent = 'Ошибка при загрузке файла.';
                analysisResultsDiv.innerHTML = `<p>Ошибка: ${uploadData.error}</p>`;
                return;
            }
            
            const uploadedContractText = uploadData.contract_text;
            console.log('analyzeButton: Получен текст загруженного договора (первые 200 символов):', uploadedContractText.substring(0, 200));
            
            // Отображаем текст сразу
            displayContractAndAnalysis(uploadedContractText, []); // Пока без анализа

            // Запускаем асинхронный анализ
            startAnalysisAndPollStatus(uploadedContractText);

        } catch (error) {
            console.error('analyzeButton: Критическая ошибка при загрузке/анализе файла:', error);
            alert('Критическая ошибка при загрузке или анализе файла: ' + error.message);
            contractTextDisplayDiv.textContent = 'Ошибка при обработке файла.';
            analysisResultsDiv.innerHTML = `<p>Произошла ошибка: ${error.message}</p>`;
        }
    });
});
