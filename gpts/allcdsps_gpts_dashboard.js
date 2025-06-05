const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3041;

// Independent paths - no env dependency
const COST_DATA_DIR = path.join(__dirname, 'cost_data');
const USER_DATA_DIR = path.join(__dirname, 'user_data');
// CHAT_HISTORIES_DIR is no longer used as a primary source for getDialogStats,
// but kept if other parts of a larger system might use it, or for future reference.
const CHAT_HISTORIES_DIR = path.join(__dirname, 'chat_histories');

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Helper functions
function safeReadDir(dirPath) {
    try {
        return fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : [];
    } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error.message);
        return [];
    }
}

function safeReadJSON(filePath) {
    try {
        return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
    } catch (error) {
        console.error(`Error reading JSON file ${filePath}:`, error.message);
        return null;
    }
}

function getCostDataFromFiles() {
    const costFiles = safeReadDir(COST_DATA_DIR).filter(file => 
        file.startsWith('costs_') && file.endsWith('.json')
    );
    
    let allCosts = [];
    const dailyCosts = {};
    const botCosts = {};
    const modelCosts = {};
    
    costFiles.forEach(filename => {
        const filePath = path.join(COST_DATA_DIR, filename);
        const costData = safeReadJSON(filePath);
        
        if (costData && Array.isArray(costData)) {
            costData.forEach(entry => {
                allCosts.push(entry);
                
                const date = new Date(entry.timestamp).toISOString().split('T')[0];
                
                if (!dailyCosts[date]) {
                    dailyCosts[date] = { totalCost: 0, requests: 0, users: new Set() };
                }
                dailyCosts[date].totalCost += entry.cost || 0;
                dailyCosts[date].requests += 1;
                dailyCosts[date].users.add(entry.chatId);
                
                const botName = entry.nameprompt || 'unknown';
                if (!botCosts[botName]) {
                    botCosts[botName] = { totalCost: 0, requests: 0, chats: new Set() };
                }
                botCosts[botName].totalCost += entry.cost || 0;
                botCosts[botName].requests += 1;
                botCosts[botName].chats.add(entry.chatId);
                
                const modelName = entry.model || 'unknown';
                if (!modelCosts[modelName]) {
                    modelCosts[modelName] = { totalCost: 0, requests: 0, inputTokens: 0, outputTokens: 0 };
                }
                modelCosts[modelName].totalCost += entry.cost || 0;
                modelCosts[modelName].requests += 1;
                modelCosts[modelName].inputTokens += entry.inputTokens || 0;
                modelCosts[modelName].outputTokens += entry.outputTokens || 0;
            });
        }
    });
    
    Object.keys(dailyCosts).forEach(date => {
        dailyCosts[date].uniqueUsers = dailyCosts[date].users.size;
        delete dailyCosts[date].users;
    });
    
    Object.keys(botCosts).forEach(bot => {
        botCosts[bot].uniqueChats = botCosts[bot].chats.size;
        delete botCosts[bot].chats;
    });
    
    return {
        allCosts,
        dailyCosts,
        botCosts,
        modelCosts,
        totalEntries: allCosts.length,
        totalCost: allCosts.reduce((sum, entry) => sum + (entry.cost || 0), 0)
    };
}

function calculateLandingStats(allChatLogFilePaths) {
    const stats = {
        totalUsersReachedLanding: 0,
        totalUsersProceededFromLanding: 0,
        conversionRate: 0,
        landingDetails: []
    };

    allChatLogFilePaths.forEach(chatLogPath => {
        try {
            const filename = path.basename(chatLogPath);
            const chatIdMatch = filename.match(/chat_(\d+)\.log/);
            if (!chatIdMatch || !chatIdMatch[1]) {
                // console.warn(`Could not parse chatId from filename: ${filename}`);
                return;
            }
            const chatId = chatIdMatch[1];

            let userName = null;
            let reachedLanding = false;
            let proceededFromLanding = false;
            let landingShownTime = null;
            let firstMessageAfterLanding = null;
            const isPaid = false; // Defaulting to false as this info is not in logs

            if (fs.existsSync(chatLogPath)) {
                const logContent = fs.readFileSync(chatLogPath, 'utf8');
                const logLines = logContent.trim().split('\n').filter(line => line.trim());
                
                logLines.forEach(line => {
                    try {
                        const logEntry = JSON.parse(line);
                        
                        // Extract user name
                        if (!userName && logEntry.role === 'user' && logEntry.content && Array.isArray(logEntry.content)) {
                            logEntry.content.forEach(contentItem => {
                                if (contentItem.type === 'input_text' && contentItem.text && contentItem.text.startsWith('Пользователь предоставил имя: ')) {
                                    userName = contentItem.text.substring('Пользователь предоставил имя: '.length).trim();
                                }
                            });
                        } else if (!userName && logEntry.type === 'user' && logEntry.role === 'user' && logEntry.content && typeof logEntry.content === 'string' && logEntry.content.startsWith('Пользователь предоставил имя: ')) {
                            // Handle older format if necessary, or adapt to specific log structure
                             userName = logEntry.content.substring('Пользователь предоставил имя: '.length).trim();
                        }


                        // Check if landing was shown
                        if (logEntry.type === 'system' && logEntry.content && logEntry.content.type === 'landing_shown') {
                            reachedLanding = true;
                            landingShownTime = logEntry.timestamp || new Date().toISOString();
                        }
                        
                        // Check if user proceeded
                        if (reachedLanding && !proceededFromLanding) {
                            // Check for callback query like 'try_free_clicked'
                            if (logEntry.type === 'callback_query' && logEntry.action === 'try_free_clicked') {
                                proceededFromLanding = true;
                                firstMessageAfterLanding = logEntry.timestamp || new Date().toISOString();
                            } 
                            // Check for a user message after landing was shown
                            else if (logEntry.role === 'user' && 
                                      (!logEntry.type || (logEntry.type !== 'name_provided' && (!logEntry.content || !JSON.stringify(logEntry.content).includes('Пользователь предоставил имя:')))) &&
                                      logEntry.timestamp && landingShownTime &&
                                      new Date(logEntry.timestamp) > new Date(landingShownTime)) {
                                proceededFromLanding = true;
                                firstMessageAfterLanding = logEntry.timestamp;
                            }
                        }
                    } catch (parseError) {
                        // console.error(`Error parsing log line in ${chatLogPath}: ${parseError.message} - Line: ${line}`);
                    }
                });
                
                if (reachedLanding && userName) { 
                    stats.totalUsersReachedLanding++;
                    stats.landingDetails.push({
                        chatId: chatId,
                        userName: userName,
                        firstName: userName, 
                        reachedAt: landingShownTime,
                        proceeded: proceededFromLanding,
                        proceededAt: firstMessageAfterLanding,
                        isPaid: isPaid 
                    });
                    
                    if (proceededFromLanding) {
                        stats.totalUsersProceededFromLanding++;
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing chat log file ${chatLogPath}:`, error);
        }
    });

    if (stats.totalUsersReachedLanding > 0) {
        stats.conversionRate = (stats.totalUsersProceededFromLanding / stats.totalUsersReachedLanding * 100).toFixed(1);
    }

    return stats;
}

function getDialogStats() {
    const botSubdirectories = safeReadDir(USER_DATA_DIR).filter(entry => {
        const entryPath = path.join(USER_DATA_DIR, entry);
        try {
            return fs.statSync(entryPath).isDirectory();
        } catch (e) {
            return false;
        }
    });

    const allChatLogFilePaths = [];
    const botDistribution = {}; // Stores count of chats per bot
    const dailyStats = {};    // Stores messages and unique users per day
    let totalMessages = 0;
    let totalUserMessages = 0;
    let totalBotMessages = 0;
    const allUserChatIds = new Set(); // To count unique users across all bots

    botSubdirectories.forEach(botName => {
        const botChatHistoriesDir = path.join(USER_DATA_DIR, botName, 'chat_histories');
        if (fs.existsSync(botChatHistoriesDir)) {
            const chatFilesForBot = safeReadDir(botChatHistoriesDir)
                .filter(file => file.startsWith('chat_') && file.endsWith('.log'))
                .map(file => path.join(botChatHistoriesDir, file));
            
            allChatLogFilePaths.push(...chatFilesForBot);
            
            // Each log file represents a chat session for that bot
            botDistribution[botName] = (botDistribution[botName] || 0) + chatFilesForBot.length;

            chatFilesForBot.forEach(logFilePath => {
                try {
                    const filename = path.basename(logFilePath);
                    const chatIdMatch = filename.match(/chat_(\d+)\.log/);
                    const currentChatId = chatIdMatch && chatIdMatch[1] ? chatIdMatch[1] : null;
                    
                    if (currentChatId) {
                        allUserChatIds.add(currentChatId);
                    }

                    const chatContent = fs.readFileSync(logFilePath, 'utf8');
                    const lines = chatContent.split('\n').filter(Boolean);
                    
                    lines.forEach(line => {
                        try {
                            const entry = JSON.parse(line);
                            totalMessages++;
                            
                            if (entry.role === 'user') totalUserMessages++;
                            if (entry.role === 'assistant') totalBotMessages++; // Assuming 'assistant' is bot
                            
                            if (entry.timestamp && currentChatId) {
                                const date = new Date(entry.timestamp).toISOString().split('T')[0];
                                if (!dailyStats[date]) {
                                    dailyStats[date] = { messages: 0, users: new Set() };
                                }
                                dailyStats[date].messages++;
                                dailyStats[date].users.add(currentChatId);
                            }
                        } catch (parseError) {
                            // console.error(`Error parsing log line in ${logFilePath}: ${parseError.message}`);
                        }
                    });
                } catch (readError) {
                    console.error(`Error reading chat file ${logFilePath}:`, readError.message);
                }
            });
        }
    });
    
    Object.keys(dailyStats).forEach(date => {
        dailyStats[date].uniqueUsers = dailyStats[date].users.size;
        delete dailyStats[date].users;
    });
    
    const landingStats = calculateLandingStats(allChatLogFilePaths);
    
    // These stats are now harder to get accurately from logs alone
    const paidUsers = 0; 
    const stoppedDialogs = 0;
    const unclearDialogs = 0;
    // Active dialogs could be inferred, e.g. chats with recent activity, but for now, set to total users or a placeholder
    const activeDialogs = allUserChatIds.size; 

    return {
        totalUsers: allUserChatIds.size,
        activeDialogs, // This is now total unique users from logs
        paidUsers,     // Cannot determine from logs
        stoppedDialogs,// Cannot determine from logs
        unclearDialogs,// Cannot determine from logs
        totalMessages,
        totalUserMessages,
        totalBotMessages,
        botDistribution, // This now shows chats per bot category
        dailyStats,
        landing: landingStats
    };
}

function getCostMetrics() {
    const costData = getCostDataFromFiles();
    
    if (costData.totalEntries === 0) {
        return {
            available: false,
            message: 'No cost data files found'
        };
    }
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const todayCosts = costData.dailyCosts[today] || { totalCost: 0, requests: 0, uniqueUsers: 0 };
    const yesterdayCosts = costData.dailyCosts[yesterday] || { totalCost: 0, requests: 0, uniqueUsers: 0 };
    
    let weeklyCosts = { totalCost: 0, requests: 0, uniqueUsers: new Set() };
    for (let i = 0; i < 7; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dayCosts = costData.dailyCosts[date];
        if (dayCosts) {
            weeklyCosts.totalCost += dayCosts.totalCost;
            weeklyCosts.requests += dayCosts.requests;
            costData.allCosts
                .filter(c => new Date(c.timestamp).toISOString().split('T')[0] === date)
                .forEach(c => weeklyCosts.uniqueUsers.add(c.chatId));
        }
    }
    weeklyCosts.uniqueUsers = weeklyCosts.uniqueUsers.size;
    
    let monthlyCosts = { totalCost: 0, requests: 0, uniqueUsers: new Set() };
    for (let i = 0; i < 30; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dayCosts = costData.dailyCosts[date];
        if (dayCosts) {
            monthlyCosts.totalCost += dayCosts.totalCost;
            monthlyCosts.requests += dayCosts.requests;
            costData.allCosts
                .filter(c => new Date(c.timestamp).toISOString().split('T')[0] === date)
                .forEach(c => monthlyCosts.uniqueUsers.add(c.chatId));
        }
    }
    monthlyCosts.uniqueUsers = monthlyCosts.uniqueUsers.size;
    
    return {
        available: true,
        today: todayCosts,
        yesterday: yesterdayCosts,
        weekly: weeklyCosts,
        monthly: monthlyCosts,
        byBot: costData.botCosts,
        byModel: costData.modelCosts,
        totalCost: costData.totalCost,
        totalRequests: costData.totalEntries
    };
}

// API Routes
app.get('/api/stats', (req, res) => {
    try {
        const dialogStats = getDialogStats();
        const costMetrics = getCostMetrics();
        
        res.json({
            success: true,
            data: {
                dialogs: dialogStats,
                costs: costMetrics,
                timestamp: new Date().toISOString(),
                dataSource: 'user_data subdirectories and cost_data directory' // Updated data source
            }
        });
    } catch (error) {
        console.error('Error generating stats:', error.message, error.stack);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/daily-chart/:days', (req, res) => {
    try {
        const days = Math.min(parseInt(req.params.days) || 7, 30); 
        const costData = getCostDataFromFiles(); // Assuming cost data is still separate
        const dialogData = getDialogStats(); // Get dialog data for user counts
        const chartData = [];
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const dayCosts = costData.dailyCosts && costData.dailyCosts[date] ? costData.dailyCosts[date] : { totalCost: 0, requests: 0 };
            const dayDialogs = dialogData.dailyStats && dialogData.dailyStats[date] ? dialogData.dailyStats[date] : { uniqueUsers: 0 };
            
            chartData.push({
                date,
                cost: dayCosts.totalCost,
                requests: dayCosts.requests, // This comes from cost data
                users: dayDialogs.uniqueUsers // This now comes from dialog data (log parsing)
            });
        }
        
        res.json({
            success: true,
            data: chartData
        });
    } catch (error) {
        console.error('Error generating daily chart data:', error.message, error.stack);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Serve dashboard HTML
app.get('/', (req, res) => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot Dashboard - Cost Analytics</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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
        .wide-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
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
        .chart-container { height: 300px; margin-top: 20px; }
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Bot Analytics Dashboard</h1>
            <p>Cost and Dialog Analytics | Last Updated: <span id="lastUpdate">Loading...</span></p>
        </div>
        
        <button class="refresh-btn" onclick="loadDashboard()">🔄 Refresh Data</button>
        
        <div id="content" class="loading">
            <p>Loading dashboard data...</p>
        </div>
    </div>

    <script>
        let chartInstance = null;
        
        async function loadDashboard() {
            try {
                document.getElementById('content').innerHTML = '<div class="loading"><p>Loading dashboard data...</p></div>';
                
                const response = await fetch('/api/stats');
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to load stats');
                }
                
                renderDashboard(result.data);
                document.getElementById('lastUpdate').textContent = new Date(result.data.timestamp).toLocaleString();
                
            } catch (error) {
                console.error('Error loading dashboard:', error);
                document.getElementById('content').innerHTML = \`
                    <div class="card">
                        <h3 style="color: #e74c3c;">❌ Error Loading Dashboard</h3>
                        <p>\${error.message}</p>
                        <p>Check console for more details.</p>
                    </div>
                \`;
            }
        }
        
        function renderDashboard(data) {
            const { dialogs, costs } = data;
            
            let costCards = '';
            if (costs && costs.available) {
                const modelDistributionHtml = Object.entries(costs.byModel || {}).map(([model, stats]) => \`
                    <div class="metric">
                        <span>\${model}</span>
                        <span class="metric-value cost">$\${(stats.totalCost || 0).toFixed(4)} (\${stats.requests || 0} req, \${(stats.inputTokens || 0) + (stats.outputTokens || 0)} tokens)</span>
                    </div>
                \`).join('');

                costCards = \`
                    <div class="card summary-card">
                        <h3>💰 Total Cost Overview</h3>
                        <div class="summary-number">$\${(costs.totalCost || 0).toFixed(4)}</div>
                        <p>\${costs.totalRequests || 0} total requests</p>
                    </div>
                    
                    <div class="card">
                        <h3>📅 Daily Cost Overview</h3>
                        <div class="metric">
                            <span>Today</span>
                            <span class="metric-value cost">$\${(costs.today.totalCost || 0).toFixed(4)} (\${costs.today.requests || 0} requests, \${costs.today.uniqueUsers || 0} users)</span>
                        </div>
                        <div class="metric">
                            <span>Yesterday</span>
                            <span class="metric-value">$\${(costs.yesterday.totalCost || 0).toFixed(4)} (\${costs.yesterday.requests || 0} requests, \${costs.yesterday.uniqueUsers || 0} users)</span>
                        </div>
                        <div class="metric">
                            <span>This Week</span>
                            <span class="metric-value">$\${(costs.weekly.totalCost || 0).toFixed(4)} (\${costs.weekly.requests || 0} requests, \${costs.weekly.uniqueUsers || 0} users)</span>
                        </div>
                        <div class="metric">
                            <span>This Month</span>
                            <span class="metric-value">$\${(costs.monthly.totalCost || 0).toFixed(4)} (\${costs.monthly.requests || 0} requests, \${costs.monthly.uniqueUsers || 0} users)</span>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3>🔧 Cost by Bot</h3>
                        \${Object.entries(costs.byBot || {}).map(([bot, stats]) => \`
                            <div class="metric">
                                <span>\${bot}</span>
                                <span class="metric-value cost">$\${(stats.totalCost || 0).toFixed(4)} (\${stats.requests || 0} req, \${stats.uniqueChats || 0} chats)</span>
                            </div>
                        \`).join('')}
                    </div>
                    
                    <div class="card">
                        <h3>🤖 Cost by Model</h3>
                        \${modelDistributionHtml || '<p style="color: #666;">No model data available</p>'}
                    </div>
                \`;
            } else {
                costCards = \`
                    <div class="card">
                        <h3>💰 Cost Tracking</h3>
                        <p style="color: #666;">\${(costs && costs.message) || 'Cost tracking not available or no data'}</p>
                    </div>
                \`;
            }
            
            const landingTableRows = (dialogs.landing.landingDetails || []).map(user => {
                const userName = user.userName || user.firstName || \`ID: \${user.chatId}\`;
                const reachedDate = user.reachedAt ? new Date(user.reachedAt).toLocaleDateString('ru-RU') : '-';
                const proceededDate = user.proceededAt ? new Date(user.proceededAt).toLocaleDateString('ru-RU') : '-';
                const statusClass = user.isPaid ? 'status-paid' : (user.proceeded ? 'status-proceeded' : 'status-landing');
                const status = user.isPaid ? '💰 Оплачено' : (user.proceeded ? '✅ Прошел дальше' : '⏳ На лендинге');
                
                return \`
                    <tr>
                        <td>\${userName}</td>
                        <td>\${reachedDate}</td>
                        <td>\${user.proceeded ? proceededDate : '-'}</td>
                        <td class="\${statusClass}">\${status}</td>
                    </tr>
                \`;
            }).join('');
            
            const botDistributionHtml = Object.entries(dialogs.botDistribution || {}).map(([bot, count]) => \`
                <div class="metric">
                    <span>\${bot} (chats)</span>
                    <span class="metric-value">\${count}</span>
                </div>
            \`).join('');
            
            document.getElementById('content').innerHTML = \`
                <div class="grid">
                    \${costCards}
                    
                    <div class="card landing-stats">
                        <h3>🎯 Аналитика лендинга</h3>
                        <div class="conversion-rate">\${dialogs.landing.conversionRate || 0}%</div>
                        <div style="margin-bottom: 20px;">Конверсия лендинга</div>
                        
                        <div class="landing-metric">
                            <span class="landing-number">\${dialogs.landing.totalUsersReachedLanding || 0}</span>
                            <span class="landing-label">Дошли до лендинга</span>
                        </div>
                        
                        <div class="landing-metric">
                            <span class="landing-number">\${dialogs.landing.totalUsersProceededFromLanding || 0}</span>
                            <span class="landing-label">Прошли дальше</span>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3>👥 Dialog Statistics (from logs)</h3>
                        <div class="metric">
                            <span>Total Unique Users (Chats)</span>
                            <span class="metric-value info">\${dialogs.totalUsers || 0}</span>
                        </div>
                        <div class="metric">
                            <span>Active Dialogs (approximated)</span>
                            <span class="metric-value status status-active">\${dialogs.activeDialogs || 0}</span>
                        </div>
                        <div class="metric">
                            <span>Paid Users (N/A from logs)</span>
                            <span class="metric-value cost">\${dialogs.paidUsers || 0}</span>
                        </div>
                        <div class="metric">
                            <span>Stopped Dialogs (N/A from logs)</span>
                            <span class="metric-value status status-stopped">\${dialogs.stoppedDialogs || 0}</span>
                        </div>
                        <div class="metric">
                            <span>Unclear Dialogs (N/A from logs)</span>
                            <span class="metric-value status status-unclear">\${dialogs.unclearDialogs || 0}</span>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3>💬 Message Statistics</h3>
                        <div class="metric">
                            <span>Total Messages</span>
                            <span class="metric-value">\${dialogs.totalMessages || 0}</span>
                        </div>
                        <div class="metric">
                            <span>User Messages</span>
                            <span class="metric-value info">\${dialogs.totalUserMessages || 0}</span>
                        </div>
                        <div class="metric">
                            <span>Bot Messages</span>
                            <span class="metric-value">\${dialogs.totalBotMessages || 0}</span>
                        </div>
                        <div class="metric">
                            <span>Avg. Messages/User (Chat)</span>
                            <span class="metric-value">\${(dialogs.totalUsers || 0) > 0 ? ((dialogs.totalMessages || 0) / dialogs.totalUsers).toFixed(1) : '0'}</span>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3>🤖 Chats by Bot Category</h3>
                        \${botDistributionHtml || '<p style="color: #666;">No data available</p>'}
                    </div>
                </div>
                
                <div class="card">
                    <h3>📊 Детализация лендинга</h3>
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
                            \${landingTableRows || '<tr><td colspan="4" style="text-align: center; color: #666;">Нет данных по лендингу</td></tr>'}
                        </tbody>
                    </table>
                </div>
                
                <div class="card">
                    <h3>📊 Daily Cost & Usage Chart (Last 7 Days)</h3>
                    <div class="chart-container">
                        <canvas id="costChart"></canvas>
                    </div>
                </div>
            \`;
            
            loadChart();
        }
        
        async function loadChart(days = 7) {
            try {
                const response = await fetch(\`/api/daily-chart/\${days}\`);
                const result = await response.json();
                
                if (result.success && result.data) {
                    renderChart(result.data);
                } else {
                    console.error('Failed to load chart data or data is empty:', result.error);
                     document.getElementById('costChart').parentElement.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading chart data.</p>';
                }
            } catch (error) {
                console.error('Error loading chart data:', error);
                document.getElementById('costChart').parentElement.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading chart data.</p>';
            }
        }
        
        function renderChart(data) {
            const ctx = document.getElementById('costChart').getContext('2d');
            
            if (chartInstance) {
                chartInstance.destroy();
            }
            
            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.map(d => new Date(d.date).toLocaleDateString('ru-RU')),
                    datasets: [
                        {
                            label: 'Cost ($)',
                            data: data.map(d => d.cost),
                            borderColor: '#27ae60',
                            backgroundColor: 'rgba(39, 174, 96, 0.1)',
                            tension: 0.4,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Requests',
                            data: data.map(d => d.requests),
                            borderColor: '#3498db',
                            backgroundColor: 'rgba(52, 152, 219, 0.1)',
                            tension: 0.4,
                            yAxisID: 'y1'
                        },
                        {
                            label: 'Unique Users (from logs)',
                            data: data.map(d => d.users),
                            borderColor: '#e74c3c',
                            backgroundColor: 'rgba(231, 76, 60, 0.1)',
                            tension: 0.4,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Cost ($)'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Requests / Users'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    }
                }
            });
        }
        
        loadDashboard();
        setInterval(loadDashboard, 5 * 60 * 1000);
    </script>
</body>
</html>`;
    res.send(htmlContent);
});

// Start server
app.listen(PORT, () => {
    console.log(`[Dashboard] Server running on http://localhost:${PORT}`);
    console.log(`[Dashboard] Reading cost data from: ${COST_DATA_DIR}`);
    console.log(`[Dashboard] Reading user data (logs) from subdirectories in: ${USER_DATA_DIR}`);
    // console.log(`[Dashboard] CHAT_HISTORIES_DIR constant is: ${CHAT_HISTORIES_DIR}`); // For reference
});

module.exports = app;
