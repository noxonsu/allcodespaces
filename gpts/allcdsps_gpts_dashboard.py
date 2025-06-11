import os
import json
import re
from datetime import datetime, timedelta
from collections import defaultdict
from flask import Flask, jsonify, request, render_template_string

# Независимые пути - без зависимости от env
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COST_DATA_DIR = os.path.join(BASE_DIR, 'cost_data')
USER_DATA_DIR = os.path.join(BASE_DIR, 'user_data')
# CHAT_HISTORIES_DIR больше не используется как основной источник для get_dialog_stats,
# но сохраняется, если другие части более крупной системы могут его использовать, или для будущих ссылок.
CHAT_HISTORIES_DIR = os.path.join(BASE_DIR, 'chat_histories')

app = Flask(__name__)
PORT = os.environ.get('DASHBOARD_PORT', 3041)

def safe_read_dir(dir_path):
    """Безопасно читает содержимое директории."""
    try:
        if os.path.exists(dir_path) and os.path.isdir(dir_path):
            return os.listdir(dir_path)
        return []
    except Exception as e:
        print(f"Ошибка чтения директории {dir_path}: {e}")
        return []

def safe_read_json(file_path):
    """Безопасно читает и парсит JSON-файл."""
    try:
        if os.path.exists(file_path) and os.path.isfile(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    except json.JSONDecodeError as e:
        print(f"Ошибка парсинга JSON-файла {file_path}: {e}")
        return None
    except Exception as e:
        print(f"Ошибка чтения файла {file_path}: {e}")
        return None

def get_cost_data_from_files():
    """Собирает данные о расходах из файлов."""
    print(f"[DEBUG] Начинаем чтение данных о расходах из {COST_DATA_DIR}")
    start_time = datetime.now()
    
    cost_files = [f for f in safe_read_dir(COST_DATA_DIR) if f.startswith('costs_') and f.endswith('.json')]
    print(f"[DEBUG] Найдено файлов расходов: {len(cost_files)}")
    
    # Ограничиваем количество файлов для быстрой загрузки
    cost_files = cost_files[:5]  # Только первые 5 файлов
    print(f"[DEBUG] Обрабатываем только первые {len(cost_files)} файлов расходов")
    
    all_costs = []
    daily_costs = defaultdict(lambda: {'totalCost': 0, 'requests': 0, 'users': set()})
    bot_costs = defaultdict(lambda: {'totalCost': 0, 'requests': 0, 'chats': set()})
    model_costs = defaultdict(lambda: {'totalCost': 0, 'requests': 0, 'inputTokens': 0, 'outputTokens': 0})
    
    for i, filename in enumerate(cost_files):
        print(f"[DEBUG] Обрабатываем файл {i+1}/{len(cost_files)}: {filename}")
        file_path = os.path.join(COST_DATA_DIR, filename)
        cost_data = safe_read_json(file_path)
        
        if cost_data and isinstance(cost_data, list):
            # Ограничиваем количество записей в файле
            limited_data = cost_data[:1000]  # Максимум 1000 записей на файл
            print(f"[DEBUG] Обрабатываем {filename}: {len(limited_data)} записей из {len(cost_data)}")
            
            for entry in limited_data:
                all_costs.append(entry)
                
                try:
                    date = datetime.fromisoformat(entry.get('timestamp')).strftime('%Y-%m-%d')
                except (TypeError, ValueError):
                    continue
                
                daily_costs[date]['totalCost'] += entry.get('cost', 0)
                daily_costs[date]['requests'] += 1
                daily_costs[date]['users'].add(entry.get('chatId'))
                
                bot_name = entry.get('nameprompt', 'unknown')
                bot_costs[bot_name]['totalCost'] += entry.get('cost', 0)
                bot_costs[bot_name]['requests'] += 1
                bot_costs[bot_name]['chats'].add(entry.get('chatId'))
                
                model_name = entry.get('model', 'unknown')
                model_costs[model_name]['totalCost'] += entry.get('cost', 0)
                model_costs[model_name]['requests'] += 1
                model_costs[model_name]['inputTokens'] += entry.get('inputTokens', 0)
                model_costs[model_name]['outputTokens'] += entry.get('outputTokens', 0)
    
    for date, data in daily_costs.items():
        data['uniqueUsers'] = len(data['users'])
        del data['users']
    
    for bot, data in bot_costs.items():
        data['uniqueChats'] = len(data['chats'])
        del data['chats']
    
    processing_time = (datetime.now() - start_time).total_seconds()
    print(f"[DEBUG] Данные о расходах загружены за {processing_time:.2f}s: {len(all_costs)} записей")
    return {
        'allCosts': all_costs,
        'dailyCosts': dict(daily_costs),
        'botCosts': dict(bot_costs),
        'modelCosts': dict(model_costs),
        'totalEntries': len(all_costs),
        'totalCost': sum(entry.get('cost', 0) for entry in all_costs)
    }

def calculate_landing_stats(all_chat_log_file_paths):
    """Рассчитывает статистику лендинга на основе логов чатов."""
    print(f"[DEBUG] Анализируем лендинг для {len(all_chat_log_file_paths)} файлов логов")
    start_time = datetime.now()
    
    stats = {
        'totalUsersReachedLanding': 0,
        'totalUsersProceededFromLanding': 0,
        'conversionRate': 0,
        'landingDetails': []
    }

    # Еще больше ограничиваем для быстрой диагностики
    files_to_process = all_chat_log_file_paths[:20]  # Только 20 файлов
    print(f"[DEBUG] Ограничиваем анализ лендинга до {len(files_to_process)} файлов из {len(all_chat_log_file_paths)}")

    for i, chat_log_path in enumerate(files_to_process):
        if i % 5 == 0:
            elapsed = (datetime.now() - start_time).total_seconds()
            print(f"[DEBUG] Обработано лендинг файлов: {i}/{len(files_to_process)} за {elapsed:.1f}s")
            
        try:
            filename = os.path.basename(chat_log_path)
            chat_id_match = re.match(r'chat_(\d+)\.log', filename)
            if not chat_id_match:
                continue
            chat_id = chat_id_match.group(1)

            user_name = f"User_{chat_id}"  # Упрощаем для быстроты
            reached_landing = False
            proceeded_from_landing = False
            landing_shown_time = None
            first_message_after_landing = None
            is_paid = False

            if os.path.exists(chat_log_path):
                # Читаем только первые 20 строк для максимальной скорости
                with open(chat_log_path, 'r', encoding='utf-8') as f:
                    log_lines = []
                    for line_num, line in enumerate(f):
                        if line_num >= 20:  # Очень ограниченное чтение
                            break
                        line = line.strip()
                        if line:
                            log_lines.append(line)
                
                for line in log_lines:
                    try:
                        log_entry = json.loads(line)
                        
                        # Упрощенная проверка лендинга
                        if log_entry.get('type') == 'system' and log_entry.get('content') and log_entry['content'].get('type') == 'landing_shown':
                            reached_landing = True
                            landing_shown_time = log_entry.get('timestamp', datetime.now().isoformat())
                        
                        # Упрощенная проверка продолжения
                        if reached_landing and not proceeded_from_landing:
                            if log_entry.get('type') == 'callback_query' and log_entry.get('action') == 'try_free_clicked':
                                proceeded_from_landing = True
                                first_message_after_landing = log_entry.get('timestamp', datetime.now().isoformat())
                            elif log_entry.get('role') == 'user' and log_entry.get('timestamp') and landing_shown_time:
                                try:
                                    if datetime.fromisoformat(log_entry['timestamp']) > datetime.fromisoformat(landing_shown_time):
                                        proceeded_from_landing = True
                                        first_message_after_landing = log_entry['timestamp']
                                except:
                                    pass
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            print(f"Ошибка обработки файла логов чата {chat_log_path}: {e}")
            continue
        
        if reached_landing: 
            stats['totalUsersReachedLanding'] += 1
            stats['landingDetails'].append({
                'chatId': chat_id,
                'userName': user_name,
                'firstName': user_name, 
                'reachedAt': landing_shown_time,
                'proceeded': proceeded_from_landing,
                'proceededAt': first_message_after_landing,
                'isPaid': is_paid 
            })
            
            if proceeded_from_landing:
                stats['totalUsersProceededFromLanding'] += 1

    if stats['totalUsersReachedLanding'] > 0:
        stats['conversionRate'] = round((stats['totalUsersProceededFromLanding'] / stats['totalUsersReachedLanding']) * 100, 1)

    processing_time = (datetime.now() - start_time).total_seconds()
    print(f"[DEBUG] Лендинг статистика за {processing_time:.2f}s: {stats['totalUsersReachedLanding']} дошли, {stats['totalUsersProceededFromLanding']} прошли дальше")
    return stats

def get_dialog_stats():
    """Собирает статистику диалогов из логов."""
    print(f"[DEBUG] Начинаем сбор статистики диалогов из {USER_DATA_DIR}")
    start_time = datetime.now()
    
    bot_subdirectories = [entry for entry in safe_read_dir(USER_DATA_DIR) if os.path.isdir(os.path.join(USER_DATA_DIR, entry))]
    print(f"[DEBUG] Найдено поддиректорий ботов: {len(bot_subdirectories)}")

    # Ограничиваем количество ботов для диагностики
    bot_subdirectories = bot_subdirectories[:3]  # Только первые 3 бота
    print(f"[DEBUG] Обрабатываем только первые {len(bot_subdirectories)} ботов: {bot_subdirectories}")

    all_chat_log_file_paths = []
    bot_distribution = defaultdict(int)
    daily_stats = defaultdict(lambda: {'messages': 0, 'users': set()})
    total_messages = 0
    total_user_messages = 0
    total_bot_messages = 0
    all_user_chat_ids = set()

    for bot_idx, bot_name in enumerate(bot_subdirectories):
        print(f"[DEBUG] Обрабатываем бота {bot_idx+1}/{len(bot_subdirectories)}: {bot_name}")
        bot_start_time = datetime.now()
        
        bot_chat_histories_dir = os.path.join(USER_DATA_DIR, bot_name, 'chat_histories')
        if os.path.exists(bot_chat_histories_dir):
            chat_files_for_bot = [os.path.join(bot_chat_histories_dir, f) for f in safe_read_dir(bot_chat_histories_dir) if f.startswith('chat_') and f.endswith('.log')]
            print(f"[DEBUG] Бот {bot_name}: найдено {len(chat_files_for_bot)} файлов чатов")
            
            all_chat_log_file_paths.extend(chat_files_for_bot)
            bot_distribution[bot_name] += len(chat_files_for_bot)

            # Еще больше ограничиваем для диагностики
            files_to_process = chat_files_for_bot[:10]  # Максимум 10 файлов на бота
            print(f"[DEBUG] Обрабатываем {len(files_to_process)} файлов из {len(chat_files_for_bot)} для бота {bot_name}")
            
            for file_idx, log_file_path in enumerate(files_to_process):
                try:
                    filename = os.path.basename(log_file_path)
                    chat_id_match = re.match(r'chat_(\d+)\.log', filename)
                    current_chat_id = chat_id_match.group(1) if chat_id_match else None
                    
                    if current_chat_id:
                        all_user_chat_ids.add(current_chat_id)

                    # Читаем только первые 10 строк для быстрой диагностики
                    with open(log_file_path, 'r', encoding='utf-8') as f:
                        lines = []
                        for line_num, line in enumerate(f):
                            if line_num >= 10:
                                break
                            line = line.strip()
                            if line:
                                lines.append(line)
                    
                    for line in lines:
                        try:
                            entry = json.loads(line)
                            total_messages += 1
                            
                            if entry.get('role') == 'user':
                                total_user_messages += 1
                            if entry.get('role') == 'assistant':
                                total_bot_messages += 1
                            
                            if entry.get('timestamp') and current_chat_id:
                                try:
                                    date = datetime.fromisoformat(entry['timestamp']).strftime('%Y-%m-%d')
                                    daily_stats[date]['messages'] += 1
                                    daily_stats[date]['users'].add(current_chat_id)
                                except:
                                    pass
                        except json.JSONDecodeError:
                            pass
                except Exception as e:
                    print(f"Ошибка чтения файла чата {log_file_path}: {e}")
        
        bot_elapsed = (datetime.now() - bot_start_time).total_seconds()
        print(f"[DEBUG] Бот {bot_name} обработан за {bot_elapsed:.2f}s")
    
    for date, data in daily_stats.items():
        data['uniqueUsers'] = len(data['users'])
        del data['users']
    
    print(f"[DEBUG] Запускаем анализ лендинга...")
    landing_stats = calculate_landing_stats(all_chat_log_file_paths)
    
    paid_users = 0 
    stopped_dialogs = 0
    unclear_dialogs = 0
    active_dialogs = len(all_user_chat_ids) 

    processing_time = (datetime.now() - start_time).total_seconds()
    print(f"[DEBUG] Статистика диалогов собрана за {processing_time:.2f}s: {len(all_user_chat_ids)} пользователей, {total_messages} сообщений")
    return {
        'totalUsers': len(all_user_chat_ids),
        'activeDialogs': active_dialogs,
        'paidUsers': paid_users,
        'stoppedDialogs': stopped_dialogs,
        'unclearDialogs': unclear_dialogs,
        'totalMessages': total_messages,
        'totalUserMessages': total_user_messages,
        'totalBotMessages': total_bot_messages,
        'botDistribution': dict(bot_distribution),
        'dailyStats': dict(daily_stats),
        'landing': landing_stats
    }

def get_cost_metrics():
    """Рассчитывает метрики расходов."""
    cost_data = get_cost_data_from_files()
    
    if cost_data['totalEntries'] == 0:
        return {
            'available': False,
            'message': 'Файлы данных о расходах не найдены'
        }
    
    today = datetime.now().strftime('%Y-%m-%d')
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    today_costs = cost_data['dailyCosts'].get(today, {'totalCost': 0, 'requests': 0, 'uniqueUsers': 0})
    yesterday_costs = cost_data['dailyCosts'].get(yesterday, {'totalCost': 0, 'requests': 0, 'uniqueUsers': 0})
    
    weekly_costs = {'totalCost': 0, 'requests': 0, 'uniqueUsers': set()}
    for i in range(7):
        date = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
        day_costs = cost_data['dailyCosts'].get(date)
        if day_costs:
            weekly_costs['totalCost'] += day_costs['totalCost']
            weekly_costs['requests'] += day_costs['requests']
            for entry in cost_data['allCosts']:
                try:
                    entry_date = datetime.fromisoformat(entry.get('timestamp')).strftime('%Y-%m-%d')
                    if entry_date == date:
                        weekly_costs['uniqueUsers'].add(entry.get('chatId'))
                except (TypeError, ValueError):
                    continue
    weekly_costs['uniqueUsers'] = len(weekly_costs['uniqueUsers'])
    
    monthly_costs = {'totalCost': 0, 'requests': 0, 'uniqueUsers': set()}
    for i in range(30):
        date = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
        day_costs = cost_data['dailyCosts'].get(date)
        if day_costs:
            monthly_costs['totalCost'] += day_costs['totalCost']
            monthly_costs['requests'] += day_costs['requests']
            for entry in cost_data['allCosts']:
                try:
                    entry_date = datetime.fromisoformat(entry.get('timestamp')).strftime('%Y-%m-%d')
                    if entry_date == date:
                        monthly_costs['uniqueUsers'].add(entry.get('chatId'))
                except (TypeError, ValueError):
                    continue
    monthly_costs['uniqueUsers'] = len(monthly_costs['uniqueUsers'])
    
    return {
        'available': True,
        'today': today_costs,
        'yesterday': yesterday_costs,
        'weekly': weekly_costs,
        'monthly': monthly_costs,
        'byBot': cost_data['botCosts'],
        'byModel': cost_data['modelCosts'],
        'totalCost': cost_data['totalCost'],
        'totalRequests': cost_data['totalEntries']
    }

# API Routes
@app.route('/api/stats')
def api_stats():
    start_time = datetime.now()
    print(f"[DEBUG] ========== Начинаем генерацию статистики в {start_time} ==========")
    
    try:
        print(f"[DEBUG] 1/3 Загружаем метрики расходов...")
        cost_start = datetime.now()
        cost_metrics = get_cost_metrics()
        cost_time = (datetime.now() - cost_start).total_seconds()
        print(f"[DEBUG] 1/3 Метрики расходов загружены за {cost_time:.2f}s")
        
        print(f"[DEBUG] 2/3 Загружаем статистику диалогов...")
        dialog_start = datetime.now()
        dialog_stats = get_dialog_stats()
        dialog_time = (datetime.now() - dialog_start).total_seconds()
        print(f"[DEBUG] 2/3 Статистика диалогов загружена за {dialog_time:.2f}s")
        
        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()
        print(f"[DEBUG] 3/3 ГОТОВО! Статистика сгенерирована за {processing_time:.2f} секунд")
        
        return jsonify({
            'success': True,
            'data': {
                'dialogs': dialog_stats,
                'costs': cost_metrics,
                'timestamp': datetime.now().isoformat(),
                'dataSource': 'user_data subdirectories and cost_data directory (LIMITED FOR DEBUGGING)',
                'processingTime': processing_time,
                'costTime': cost_time,
                'dialogTime': dialog_time
            }
        })
    except Exception as e:
        print(f"[ERROR] Ошибка генерации статистики: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/daily-chart/<int:days>')
def api_daily_chart(days):
    try:
        days = min(days, 30) 
        cost_data = get_cost_data_from_files()
        dialog_data = get_dialog_stats()
        chart_data = []
        
        for i in range(days - 1, -1, -1):
            date = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
            day_costs = cost_data['dailyCosts'].get(date, {'totalCost': 0, 'requests': 0})
            day_dialogs = dialog_data['dailyStats'].get(date, {'uniqueUsers': 0})
            
            chart_data.append({
                'date': date,
                'cost': day_costs['totalCost'],
                'requests': day_costs['requests'],
                'users': day_dialogs['uniqueUsers']
            })
        
        return jsonify({
            'success': True,
            'data': chart_data
        })
    except Exception as e:
        print(f"Ошибка генерации данных для ежедневного графика: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Serve dashboard HTML
@app.route('/')
def serve_dashboard():
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot Dashboard - Cost Analytics</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background-color: #f5f5f5; 
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 20px; 
            border-radius: 10px; 
            margin-bottom: 20px; 
            text-align: center;
        }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { 
            background: white; 
            padding: 20px; 
            border-radius: 10px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
        }
        .metric { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 10px 0; 
            border-bottom: 1px solid #eee; 
        }
        .metric:last-child { border-bottom: none; }
        .metric-value { 
            font-weight: bold; 
            color: #667eea; 
        }
        .cost { color: #27ae60; }
        .warning { color: #e74c3c; }
        .info { color: #3498db; }
        .refresh-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-bottom: 20px;
        }
        .refresh-btn:hover { background: #5a6fd8; }
        .status { 
            padding: 5px 10px; 
            border-radius: 20px; 
            font-size: 12px; 
            font-weight: bold; 
        }
        .status-active { background: #d4edda; color: #155724; }
        .status-stopped { background: #f8d7da; color: #721c24; }
        .status-unclear { background: #fff3cd; color: #856404; }
        .loading { text-align: center; padding: 40px; color: #666; }
        .summary-card {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            text-align: center;
        }
        .summary-number {
            font-size: 2em;
            font-weight: bold;
        }
        .landing-stats {
            background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);
            color: white;
            text-align: center;
        }
        .landing-metric {
            display: inline-block;
            margin: 10px 20px;
            text-align: center;
        }
        .landing-number {
            font-size: 2em;
            font-weight: bold;
            display: block;
        }
        .landing-label {
            font-size: 0.9em;
            opacity: 0.9;
        }
        .conversion-rate {
            font-size: 3em;
            font-weight: bold;
            margin: 20px 0;
        }
        .landing-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        .landing-table th,
        .landing-table td {
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        .landing-table th {
            background-color: #f8f9fa;
            font-weight: bold;
        }
        .status-proceeded { color: #28a745; font-weight: bold; }
        .status-landing { color: #ffc107; font-weight: bold; }
        .status-paid { color: #17a2b8; font-weight: bold; }
        .debug { background: #f8f9fa; padding: 10px; margin: 10px 0; border-left: 4px solid #007bff; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Bot Analytics Dashboard (Simplified)</h1>
            <p>Cost and Dialog Analytics | Last Updated: <span id="lastUpdate">Loading...</span></p>
        </div>
        
        <div class="debug">
            <strong>Debug Info:</strong> <span id="debugInfo">Initializing...</span>
        </div>
        
        <button class="refresh-btn" onclick="loadDashboard()">🔄 Refresh Data</button>
        
        <div id="content" class="loading">
            <p>Loading dashboard data...</p>
        </div>
    </div>

    <script>
        console.log('[DEBUG] Script started');
        document.getElementById('debugInfo').textContent = 'Script loaded, preparing to fetch data...';
        
        async function loadDashboard() {
            console.log('[DEBUG] loadDashboard called');
            document.getElementById('debugInfo').textContent = 'Fetching /api/stats...';
            
            try {
                document.getElementById('content').innerHTML = '<div class="loading"><p>Loading dashboard data...</p></div>';
                console.log('[DEBUG] About to fetch /api/stats');
                
                const response = await fetch('/api/stats');
                console.log('[DEBUG] Got response:', response.status);
                document.getElementById('debugInfo').textContent = `Got response: ${response.status}, parsing JSON...`;
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[DEBUG] API error:', response.status, errorText);
                    throw new Error(`API request failed: ${response.status} - ${errorText}`);
                }
                
                const result = await response.json();
                console.log('[DEBUG] Parsed JSON, success:', result.success);
                document.getElementById('debugInfo').textContent = `Data loaded successfully in ${result.data.processingTime}s, rendering...`;
                
                if (!result.success) {
                    throw new Error(result.error || 'API returned success:false');
                }
                
                console.log('[DEBUG] Calling renderDashboard');
                renderDashboard(result.data);
                document.getElementById('lastUpdate').textContent = new Date(result.data.timestamp).toLocaleString();
                document.getElementById('debugInfo').textContent = `Dashboard rendered successfully. Processing time: ${result.data.processingTime}s`;
                
            } catch (error) {
                console.error('[DEBUG] Error in loadDashboard:', error);
                document.getElementById('debugInfo').textContent = `Error: ${error.message}`;
                document.getElementById('content').innerHTML = `
                    <div class="card">
                        <h3 style="color: #e74c3c;">❌ Error Loading Dashboard</h3>
                        <p>${error.message}</p>
                        <p>Check console for more details.</p>
                    </div>
                `;
            }
        }
        
        function renderDashboard(data) {
            console.log('[DEBUG] renderDashboard called with data:', data);
            
            try {
                const { dialogs, costs } = data;
                
                let costCards = '';
                if (costs && costs.available) {
                    const modelDistributionHtml = Object.entries(costs.byModel || {}).map(([model, stats]) => `
                        <div class="metric">
                            <span>${model}</span>
                            <span class="metric-value cost">$${(stats.totalCost || 0).toFixed(4)} (${stats.requests || 0} req)</span>
                        </div>
                    `).join('');

                    costCards = `
                        <div class="card summary-card">
                            <h3>💰 Total Cost Overview</h3>
                            <div class="summary-number">$${(costs.totalCost || 0).toFixed(4)}</div>
                            <p>${costs.totalRequests || 0} total requests</p>
                        </div>
                        
                        <div class="card">
                            <h3>📅 Daily Cost Overview</h3>
                            <div class="metric">
                                <span>Today</span>
                                <span class="metric-value cost">$${(costs.today.totalCost || 0).toFixed(4)} (${costs.today.requests || 0} req)</span>
                            </div>
                            <div class="metric">
                                <span>Yesterday</span>
                                <span class="metric-value">$${(costs.yesterday.totalCost || 0).toFixed(4)} (${costs.yesterday.requests || 0} req)</span>
                            </div>
                        </div>
                        
                        <div class="card">
                            <h3>🔧 Cost by Bot</h3>
                            ${Object.entries(costs.byBot || {}).map(([bot, stats]) => `
                                <div class="metric">
                                    <span>${bot}</span>
                                    <span class="metric-value cost">$${(stats.totalCost || 0).toFixed(4)}</span>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="card">
                            <h3>🤖 Cost by Model</h3>
                            ${modelDistributionHtml || '<p style="color: #666;">No model data available</p>'}
                        </div>
                    `;
                } else {
                    costCards = `
                        <div class="card">
                            <h3>💰 Cost Tracking</h3>
                            <p style="color: #666;">${(costs && costs.message) || 'Cost tracking not available'}</p>
                        </div>
                    `;
                }
                
                const landingTableRows = (dialogs.landing.landingDetails || []).slice(0, 10).map(user => {
                    const userName = user.userName || user.firstName || `ID: ${user.chatId}`;
                    const reachedDate = user.reachedAt ? new Date(user.reachedAt).toLocaleDateString('ru-RU') : '-';
                    const proceededDate = user.proceededAt ? new Date(user.proceededAt).toLocaleDateString('ru-RU') : '-';
                    const statusClass = user.isPaid ? 'status-paid' : (user.proceeded ? 'status-proceeded' : 'status-landing');
                    const status = user.isPaid ? '💰 Оплачено' : (user.proceeded ? '✅ Прошел дальше' : '⏳ На лендинге');
                    
                    return `
                        <tr>
                            <td>${userName}</td>
                            <td>${reachedDate}</td>
                            <td>${user.proceeded ? proceededDate : '-'}</td>
                            <td class="${statusClass}">${status}</td>
                        </tr>
                    `;
                }).join('');
                
                const botDistributionHtml = Object.entries(dialogs.botDistribution || {}).map(([bot, count]) => `
                    <div class="metric">
                        <span>${bot}</span>
                        <span class="metric-value">${count} chats</span>
                    </div>
                `).join('');
                
                console.log('[DEBUG] Setting innerHTML');
                document.getElementById('content').innerHTML = `
                    <div class="grid">
                        ${costCards}
                        
                        <div class="card landing-stats">
                            <h3>🎯 Аналитика лендинга</h3>
                            <div class="conversion-rate">${dialogs.landing.conversionRate || 0}%</div>
                            <div style="margin-bottom: 20px;">Конверсия лендинга</div>
                            
                            <div class="landing-metric">
                                <span class="landing-number">${dialogs.landing.totalUsersReachedLanding || 0}</span>
                                <span class="landing-label">Дошли до лендинга</span>
                            </div>
                            
                            <div class="landing-metric">
                                <span class="landing-number">${dialogs.landing.totalUsersProceededFromLanding || 0}</span>
                                <span class="landing-label">Прошли дальше</span>
                            </div>
                        </div>
                        
                        <div class="card">
                            <h3>👥 Dialog Statistics</h3>
                            <div class="metric">
                                <span>Total Users</span>
                                <span class="metric-value info">${dialogs.totalUsers || 0}</span>
                            </div>
                            <div class="metric">
                                <span>Total Messages</span>
                                <span class="metric-value">${dialogs.totalMessages || 0}</span>
                            </div>
                            <div class="metric">
                                <span>User Messages</span>
                                <span class="metric-value info">${dialogs.totalUserMessages || 0}</span>
                            </div>
                            <div class="metric">
                                <span>Bot Messages</span>
                                <span class="metric-value">${dialogs.totalBotMessages || 0}</span>
                            </div>
                        </div>
                        
                        <div class="card">
                            <h3>🤖 Chats by Bot</h3>
                            ${botDistributionHtml || '<p style="color: #666;">No data available</p>'}
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3>📊 Детализация лендинга (первые 10)</h3>
                        <table class="landing-table">
                            <thead>
                                <tr>
                                    <th>Пользователь</th>
                                    <th>Дошел до лендинга</th>
                                    <th>Прошел дальше</th>
                                    <th>Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${landingTableRows || '<tr><td colspan="4" style="text-align: center; color: #666;">Нет данных по лендингу</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                `;
                console.log('[DEBUG] Dashboard rendered successfully');
                
            } catch (error) {
                console.error('[DEBUG] Error in renderDashboard:', error);
                document.getElementById('content').innerHTML = `
                    <div class="card">
                        <h3 style="color: #e74c3c;">❌ Error Rendering Dashboard</h3>
                        <p>${error.message}</p>
                        <p>Check console for more details.</p>
                    </div>
                `;
            }
        }
        
        console.log('[DEBUG] About to call loadDashboard');
        document.getElementById('debugInfo').textContent = 'Calling loadDashboard...';
        loadDashboard();
        
        // Убираем автообновление для отладки
        // setInterval(loadDashboard, 5 * 60 * 1000);
    </script>
</body>
</html>"""
    return render_template_string(html_content)

# Start server
if __name__ == '__main__':
    print(f"[Dashboard] Сервер запускается на http://localhost:{PORT}")
    print(f"[Dashboard] Чтение данных о расходах из: {COST_DATA_DIR}")
    print(f"[Dashboard] Чтение данных пользователя (логов) из поддиректорий в: {USER_DATA_DIR}")
    
    # Проверяем существование директорий
    print(f"[DEBUG] Проверяем директории:")
    print(f"[DEBUG] COST_DATA_DIR существует: {os.path.exists(COST_DATA_DIR)}")
    print(f"[DEBUG] USER_DATA_DIR существует: {os.path.exists(USER_DATA_DIR)}")
    
    if os.path.exists(USER_DATA_DIR):
        subdirs = safe_read_dir(USER_DATA_DIR)
        print(f"[DEBUG] Поддиректории в USER_DATA_DIR: {subdirs}")
    
    app.run(host='0.0.0.0', port=PORT, debug=True)
