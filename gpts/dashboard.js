const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3041;

// Independent paths - no env dependency
const COST_DATA_DIR = path.join(__dirname, 'cost_data');
const USER_DATA_DIR = path.join(__dirname, 'user_data');
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
                
                // Parse date from timestamp
                const date = new Date(entry.timestamp).toISOString().split('T')[0];
                
                // Daily aggregation
                if (!dailyCosts[date]) {
                    dailyCosts[date] = { totalCost: 0, requests: 0, users: new Set() };
                }
                dailyCosts[date].totalCost += entry.cost || 0;
                dailyCosts[date].requests += 1;
                dailyCosts[date].users.add(entry.chatId);
                
                // Bot aggregation
                const botName = entry.nameprompt || 'unknown';
                if (!botCosts[botName]) {
                    botCosts[botName] = { totalCost: 0, requests: 0, chats: new Set() };
                }
                botCosts[botName].totalCost += entry.cost || 0;
                botCosts[botName].requests += 1;
                botCosts[botName].chats.add(entry.chatId);
                
                // Model aggregation
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
    
    // Convert Sets to counts
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

function getDialogStats() {
    const userFiles = safeReadDir(USER_DATA_DIR).filter(file => file.endsWith('.json'));
    const chatFiles = safeReadDir(CHAT_HISTORIES_DIR).filter(file => file.startsWith('chat_') && file.endsWith('.log'));
    
    let totalUsers = 0;
    let activeDialogs = 0;
    let paidUsers = 0;
    let stoppedDialogs = 0;
    let unclearDialogs = 0;
    let totalMessages = 0;
    let totalUserMessages = 0;
    let totalBotMessages = 0;
    
    const botDistribution = {};
    const dailyStats = {};
    
    // Analyze user data
    userFiles.forEach(file => {
        const userData = safeReadJSON(path.join(USER_DATA_DIR, file));
        if (userData) {
            totalUsers++;
            if (userData.isPaid) paidUsers++;
            if (userData.dialogStopped) stoppedDialogs++;
            if (userData.dialogMovedToUnclear) unclearDialogs++;
            if (!userData.dialogStopped && !userData.dialogMovedToUnclear) activeDialogs++;
            
            // Count by bot type (NAMEPROMPT)
            const botType = userData.nameprompt || 'unknown';
            botDistribution[botType] = (botDistribution[botType] || 0) + 1;
        }
    });
    
    // Analyze chat logs
    chatFiles.forEach(file => {
        try {
            const chatContent = fs.readFileSync(path.join(CHAT_HISTORIES_DIR, file), 'utf8');
            const lines = chatContent.split('\n').filter(Boolean);
            
            lines.forEach(line => {
                try {
                    const entry = JSON.parse(line);
                    totalMessages++;
                    
                    if (entry.role === 'user') totalUserMessages++;
                    if (entry.role === 'assistant') totalBotMessages++;
                    
                    // Daily stats
                    if (entry.timestamp) {
                        const date = new Date(entry.timestamp).toISOString().split('T')[0];
                        if (!dailyStats[date]) {
                            dailyStats[date] = { messages: 0, users: new Set() };
                        }
                        dailyStats[date].messages++;
                        
                        // Extract chatId from filename
                        const chatId = file.match(/chat_(\d+)\.log/)?.[1];
                        if (chatId) dailyStats[date].users.add(chatId);
                    }
                } catch (parseError) {
                    // Skip invalid JSON lines
                }
            });
        } catch (readError) {
            console.error(`Error reading chat file ${file}:`, readError.message);
        }
    });
    
    // Convert Sets to counts for daily stats
    Object.keys(dailyStats).forEach(date => {
        dailyStats[date].uniqueUsers = dailyStats[date].users.size;
        delete dailyStats[date].users;
    });
    
    return {
        totalUsers,
        activeDialogs,
        paidUsers,
        stoppedDialogs,
        unclearDialogs,
        totalMessages,
        totalUserMessages,
        totalBotMessages,
        botDistribution,
        dailyStats
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
    
    // Calculate today/yesterday
    const todayCosts = costData.dailyCosts[today] || { totalCost: 0, requests: 0, uniqueUsers: 0 };
    const yesterdayCosts = costData.dailyCosts[yesterday] || { totalCost: 0, requests: 0, uniqueUsers: 0 };
    
    // Calculate weekly costs (last 7 days)
    let weeklyCosts = { totalCost: 0, requests: 0, uniqueUsers: new Set() };
    for (let i = 0; i < 7; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dayCosts = costData.dailyCosts[date];
        if (dayCosts) {
            weeklyCosts.totalCost += dayCosts.totalCost;
            weeklyCosts.requests += dayCosts.requests;
            // Add users from each day to the set
            costData.allCosts
                .filter(c => new Date(c.timestamp).toISOString().split('T')[0] === date)
                .forEach(c => weeklyCosts.uniqueUsers.add(c.chatId));
        }
    }
    weeklyCosts.uniqueUsers = weeklyCosts.uniqueUsers.size;
    
    // Calculate monthly costs (last 30 days)
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
                dataSource: 'cost_data directory'
            }
        });
    } catch (error) {
        console.error('Error generating stats:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/daily-chart/:days', (req, res) => {
    try {
        const days = Math.min(parseInt(req.params.days) || 7, 30); // Max 30 days
        const costData = getCostDataFromFiles();
        const chartData = [];
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const dayCosts = costData.dailyCosts[date] || { totalCost: 0, requests: 0, uniqueUsers: 0 };
            
            chartData.push({
                date,
                cost: dayCosts.totalCost,
                requests: dayCosts.requests,
                users: dayCosts.uniqueUsers
            });
        }
        
        res.json({
            success: true,
            data: chartData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Serve dashboard HTML
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
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
                    throw new Error(result.error);
                }
                
                renderDashboard(result.data);
                document.getElementById('lastUpdate').textContent = new Date(result.data.timestamp).toLocaleString();
                
            } catch (error) {
                document.getElementById('content').innerHTML = \`
                    <div class="card">
                        <h3 style="color: #e74c3c;">❌ Error Loading Dashboard</h3>
                        <p>\${error.message}</p>
                    </div>
                \`;
            }
        }
        
        function renderDashboard(data) {
            const { dialogs, costs } = data;
            
            let costCards = '';
            if (costs.available) {
                const modelDistributionHtml = Object.entries(costs.byModel).map(([model, stats]) => \`
                    <div class="metric">
                        <span>\${model}</span>
                        <span class="metric-value cost">$\${stats.totalCost.toFixed(4)} (\${stats.requests} req, \${stats.inputTokens + stats.outputTokens} tokens)</span>
                    </div>
                \`).join('');

                costCards = \`
                    <div class="card summary-card">
                        <h3>💰 Total Cost Overview</h3>
                        <div class="summary-number">$\${costs.totalCost.toFixed(4)}</div>
                        <p>\${costs.totalRequests} total requests</p>
                    </div>
                    
                    <div class="card">
                        <h3>📅 Daily Cost Overview</h3>
                        <div class="metric">
                            <span>Today</span>
                            <span class="metric-value cost">$\${costs.today.totalCost.toFixed(4)} (\${costs.today.requests} requests, \${costs.today.uniqueUsers} users)</span>
                        </div>
                        <div class="metric">
                            <span>Yesterday</span>
                            <span class="metric-value">$\${costs.yesterday.totalCost.toFixed(4)} (\${costs.yesterday.requests} requests, \${costs.yesterday.uniqueUsers} users)</span>
                        </div>
                        <div class="metric">
                            <span>This Week</span>
                            <span class="metric-value">$\${costs.weekly.totalCost.toFixed(4)} (\${costs.weekly.requests} requests, \${costs.weekly.uniqueUsers} users)</span>
                        </div>
                        <div class="metric">
                            <span>This Month</span>
                            <span class="metric-value">$\${costs.monthly.totalCost.toFixed(4)} (\${costs.monthly.requests} requests, \${costs.monthly.uniqueUsers} users)</span>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3>🔧 Cost by Bot</h3>
                        \${Object.entries(costs.byBot).map(([bot, stats]) => \`
                            <div class="metric">
                                <span>\${bot}</span>
                                <span class="metric-value cost">$\${stats.totalCost.toFixed(4)} (\${stats.requests} req, \${stats.uniqueChats} chats)</span>
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
                        <p style="color: #666;">\${costs.message || 'Cost tracking not available'}</p>
                    </div>
                \`;
            }
            
            const botDistributionHtml = Object.entries(dialogs.botDistribution).map(([bot, count]) => \`
                <div class="metric">
                    <span>\${bot}</span>
                    <span class="metric-value">\${count} users</span>
                </div>
            \`).join('');
            
            document.getElementById('content').innerHTML = \`
                <div class="grid">
                    \${costCards}
                    
                    <div class="card">
                        <h3>👥 Dialog Statistics</h3>
                        <div class="metric">
                            <span>Total Users</span>
                            <span class="metric-value info">\${dialogs.totalUsers}</span>
                        </div>
                        <div class="metric">
                            <span>Active Dialogs</span>
                            <span class="metric-value status status-active">\${dialogs.activeDialogs}</span>
                        </div>
                        <div class="metric">
                            <span>Paid Users</span>
                            <span class="metric-value cost">\${dialogs.paidUsers}</span>
                        </div>
                        <div class="metric">
                            <span>Stopped Dialogs</span>
                            <span class="metric-value status status-stopped">\${dialogs.stoppedDialogs}</span>
                        </div>
                        <div class="metric">
                            <span>Unclear Dialogs</span>
                            <span class="metric-value status status-unclear">\${dialogs.unclearDialogs}</span>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3>💬 Message Statistics</h3>
                        <div class="metric">
                            <span>Total Messages</span>
                            <span class="metric-value">\${dialogs.totalMessages}</span>
                        </div>
                        <div class="metric">
                            <span>User Messages</span>
                            <span class="metric-value info">\${dialogs.totalUserMessages}</span>
                        </div>
                        <div class="metric">
                            <span>Bot Messages</span>
                            <span class="metric-value">\${dialogs.totalBotMessages}</span>
                        </div>
                        <div class="metric">
                            <span>Avg. Messages/User</span>
                            <span class="metric-value">\${dialogs.totalUsers > 0 ? (dialogs.totalMessages / dialogs.totalUsers).toFixed(1) : '0'}</span>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h3>🤖 Users by Bot</h3>
                        \${botDistributionHtml || '<p style="color: #666;">No data available</p>'}
                    </div>
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
        
        async function loadChart() {
            try {
                const response = await fetch('/api/daily-chart/7');
                const result = await response.json();
                
                if (result.success) {
                    renderChart(result.data);
                }
            } catch (error) {
                console.error('Error loading chart data:', error);
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
                    labels: data.map(d => new Date(d.date).toLocaleDateString()),
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
                            label: 'Unique Users',
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
        
        // Load dashboard on page load
        loadDashboard();
        
        // Auto-refresh every 5 minutes
        setInterval(loadDashboard, 5 * 60 * 1000);
    </script>
</body>
</html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`[Dashboard] Server running on http://localhost:${PORT}`);
    console.log(`[Dashboard] Reading cost data from: ${COST_DATA_DIR}`);
    console.log(`[Dashboard] Reading user data from: ${USER_DATA_DIR}`);
    console.log(`[Dashboard] Reading chat logs from: ${CHAT_HISTORIES_DIR}`);
});

module.exports = app;
