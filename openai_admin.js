const fetch = require('node-fetch');
const dotenv = require('dotenv');
// это все не работает
// Configure dotenv to load variables from .env.admin
dotenv.config({ path: '.env.admin' });

const OPENAI_ADMIN_KEY = process.env.SUPERADMIN;

// Using the official Admin API endpoints
const ADMIN_API_KEYS_URL = 'https://api.openai.com/v1/organization/admin_api_keys';
const PROJECTS_URL = 'https://api.openai.com/v1/organization/projects';
const USERS_URL = 'https://api.openai.com/v1/organization/users';
const AUDIT_LOGS_URL = 'https://api.openai.com/v1/organization/audit_logs';
const USAGE_URL = 'https://api.openai.com/v1/usage';

async function fetchOpenAIAdminData() {
    if (!OPENAI_ADMIN_KEY) {
        console.error('Error: SUPERADMIN admin API key not found in .env.admin file.');
        console.error('Please ensure .env.admin exists and SUPERADMIN is set to an Admin API Key.');
        console.error('You can create Admin API Keys at: https://platform.openai.com/settings/organization/admin-keys');
        return;
    }

    console.log('Fetching organization data using Admin API...\n');

    try {
        // 1. Fetch all Admin API Keys
        console.log('📋 Fetching Admin API Keys...');
        const adminKeysResponse = await fetch(ADMIN_API_KEYS_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${OPENAI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (adminKeysResponse.ok) {
            const adminKeysData = await adminKeysResponse.json();
            console.log(`✓ Found ${adminKeysData.data.length} Admin API Keys:`);
            adminKeysData.data.forEach(key => {
                console.log(`  - ${key.name} (${key.id})`);
                console.log(`    Created: ${new Date(key.created_at * 1000).toISOString()}`);
                console.log(`    Last Used: ${key.last_used_at ? new Date(key.last_used_at * 1000).toISOString() : 'Never'}`);
                console.log(`    Owner: ${key.owner.name} (${key.owner.role})`);
                console.log('');
            });
        } else {
            console.error(`❌ Error fetching Admin API Keys: ${adminKeysResponse.status}`);
        }

        // 2. Fetch all Projects
        console.log('📁 Fetching Projects...');
        const projectsResponse = await fetch(PROJECTS_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${OPENAI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (projectsResponse.ok) {
            const projectsData = await projectsResponse.json();
            console.log(`✓ Found ${projectsData.data.length} Projects:`);
            
            for (const project of projectsData.data) {
                console.log(`  - ${project.name} (${project.id}) - Status: ${project.status}`);
                console.log(`    Created: ${new Date(project.created_at * 1000).toISOString()}`);
                
                // Fetch API Keys for each project
                const projectApiKeysResponse = await fetch(`https://api.openai.com/v1/organization/projects/${project.id}/api_keys`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_ADMIN_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (projectApiKeysResponse.ok) {
                    const projectApiKeysData = await projectApiKeysResponse.json();
                    console.log(`    🔑 API Keys (${projectApiKeysData.data.length}):`);
                    projectApiKeysData.data.forEach(key => {
                        console.log(`      - ${key.name} (${key.redacted_value})`);
                        console.log(`        Created: ${new Date(key.created_at * 1000).toISOString()}`);
                        console.log(`        Last Used: ${key.last_used_at ? new Date(key.last_used_at * 1000).toISOString() : 'Never'}`);
                        if (key.owner.type === 'user') {
                            console.log(`        Owner: ${key.owner.user.name} (${key.owner.user.email})`);
                        } else {
                            console.log(`        Owner: Service Account`);
                        }
                    });
                }
                console.log('');
            }
        } else {
            console.error(`❌ Error fetching Projects: ${projectsResponse.status}`);
        }

        // 3. Fetch Organization Users
        console.log('👥 Fetching Organization Users...');
        const usersResponse = await fetch(USERS_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${OPENAI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            console.log(`✓ Found ${usersData.data.length} Users:`);
            usersData.data.forEach(user => {
                console.log(`  - ${user.name} (${user.email}) - Role: ${user.role}`);
                console.log(`    Added: ${new Date(user.added_at * 1000).toISOString()}`);
            });
        } else {
            console.error(`❌ Error fetching Users: ${usersResponse.status}`);
        }

        // 4. Fetch Usage Information via Audit Logs
        console.log('\n📊 Fetching Usage Information...');
        const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
        const auditLogsResponse = await fetch(`${AUDIT_LOGS_URL}?effective_at[gte]=${thirtyDaysAgo}&limit=100`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${OPENAI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (auditLogsResponse.ok) {
            const auditLogsData = await auditLogsResponse.json();
            console.log(`✓ Found ${auditLogsData.data.length} audit log entries (last 30 days):`);
            
            // Filter for API usage events
            const apiUsageEvents = auditLogsData.data.filter(log => 
                log.type === 'api_key.created' || 
                log.type === 'api_key.deleted' ||
                log.type === 'request.created'
            );
            
            console.log(`  📈 API-related events: ${apiUsageEvents.length}`);
            
            // Group by event type
            const eventTypes = {};
            auditLogsData.data.forEach(log => {
                eventTypes[log.type] = (eventTypes[log.type] || 0) + 1;
            });
            
            console.log('  Event breakdown:');
            Object.entries(eventTypes).forEach(([type, count]) => {
                console.log(`    - ${type}: ${count}`);
            });
        } else {
            console.error(`❌ Error fetching Audit Logs: ${auditLogsResponse.status}`);
            const errorBody = await auditLogsResponse.text();
            console.error('Response:', errorBody);
        }

        // 5. Enhanced usage data collection and key mapping
        console.log('\n💰 Comprehensive Usage Data Collection...');
        
        // Create a map of all API keys with their IDs for reference
        const allApiKeys = new Map();
        
        if (projectsResponse.ok) {
            const projectsData = await projectsResponse.json();
            
            for (const project of projectsData.data) {
                const projectApiKeysResponse = await fetch(`https://api.openai.com/v1/organization/projects/${project.id}/api_keys`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_ADMIN_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (projectApiKeysResponse.ok) {
                    const projectApiKeysData = await projectApiKeysResponse.json();
                    projectApiKeysData.data.forEach(key => {
                        allApiKeys.set(key.id, {
                            ...key,
                            projectName: project.name,
                            projectId: project.id
                        });
                    });
                }
            }
        }

        console.log('\n🔑 Complete API Keys Mapping:');
        console.log('(Matching dashboard format: key_xxxxx with usage stats)\n');
        
        allApiKeys.forEach((keyData, keyId) => {
            console.log(`Key ID: ${keyId}`);
            console.log(`  Name: ${keyData.name}`);
            console.log(`  Redacted Value: ${keyData.redacted_value}`);
            console.log(`  Project: ${keyData.projectName} (${keyData.projectId})`);
            console.log(`  Created: ${new Date(keyData.created_at * 1000).toISOString()}`);
            console.log(`  Last Used: ${keyData.last_used_at ? new Date(keyData.last_used_at * 1000).toISOString() : 'Never'}`);
            
            if (keyData.owner.type === 'user') {
                console.log(`  Owner: ${keyData.owner.user.name} (${keyData.owner.user.email})`);
            } else {
                console.log(`  Owner: Service Account`);
            }
            console.log('  ---');
        });

        // Try various usage endpoints with key-specific parameters
        console.log('\n📊 Attempting to fetch usage statistics...');
        
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        const usageEndpoints = [
            'https://api.openai.com/v1/usage',
            'https://api.openai.com/v1/dashboard/billing/usage',
            'https://api.openai.com/v1/organization/usage',
            'https://api.openai.com/v1/organization/costs',
            'https://api.openai.com/v1/organization/billing/usage'
        ];

        for (const endpoint of usageEndpoints) {
            console.log(`\nTrying: ${endpoint}`);
            
            const variations = [
                '',
                `?start_date=${thirtyDaysAgo.toISOString().split('T')[0]}&end_date=${today.toISOString().split('T')[0]}`,
                '?bucket_width=1d',
                '?include_breakdown=true'
            ];

            for (const params of variations) {
                try {
                    const response = await fetch(`${endpoint}${params}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${OPENAI_ADMIN_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        console.log(`✓ SUCCESS with ${params || 'no params'}:`);
                        console.log(JSON.stringify(data, null, 2));
                        
                        // Try to match usage data with our key IDs
                        if (data.data && Array.isArray(data.data)) {
                            console.log('\n🔍 Matching usage data with API keys:');
                            data.data.forEach(usage => {
                                if (usage.key_id && allApiKeys.has(usage.key_id)) {
                                    const keyInfo = allApiKeys.get(usage.key_id);
                                    console.log(`  ${usage.key_id}: ${keyInfo.name} - Usage: ${JSON.stringify(usage)}`);
                                }
                            });
                        }
                        break;
                    } else {
                        console.log(`  ❌ ${params || 'no params'}: ${response.status}`);
                    }
                } catch (error) {
                    console.log(`  ❌ ${params || 'no params'}: ${error.message}`);
                }
            }
        }

        // Try to get individual key usage
        console.log('\n🎯 Attempting individual key usage lookup...');
        let keyCount = 0;
        for (const [keyId, keyData] of allApiKeys) {
            if (keyCount >= 3) break; // Limit to first 3 keys to avoid rate limits
            
            console.log(`\nChecking usage for key: ${keyId} (${keyData.name})`);
            
            const keyUsageEndpoints = [
                `https://api.openai.com/v1/usage?api_key=${keyId}`,
                `https://api.openai.com/v1/organization/usage?key_id=${keyId}`,
                `https://api.openai.com/v1/dashboard/billing/usage?api_key_id=${keyId}`
            ];

            for (const endpoint of keyUsageEndpoints) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${OPENAI_ADMIN_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        console.log(`  ✓ Found usage data: ${JSON.stringify(data, null, 2)}`);
                        break;
                    } else {
                        console.log(`  ❌ ${endpoint}: ${response.status}`);
                    }
                } catch (error) {
                    console.log(`  ❌ ${endpoint}: ${error.message}`);
                }
            }
            keyCount++;
        }

        // 6. Summary of API Keys and their last usage
        console.log('\n📊 API Keys Usage Summary:');
        console.log('Recent activity based on available data:');
        
        // Re-fetch projects to create usage summary
        if (projectsResponse.ok) {
            const projectsData = await projectsResponse.json();
            let totalKeys = 0;
            let recentlyUsedKeys = 0;
            
            for (const project of projectsData.data) {
                const projectApiKeysResponse = await fetch(`https://api.openai.com/v1/organization/projects/${project.id}/api_keys`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_ADMIN_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (projectApiKeysResponse.ok) {
                    const projectApiKeysData = await projectApiKeysResponse.json();
                    totalKeys += projectApiKeysData.data.length;
                    
                    const thirtyDaysAgoTimestamp = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
                    const recentKeys = projectApiKeysData.data.filter(key => 
                        key.last_used_at && key.last_used_at > thirtyDaysAgoTimestamp
                    );
                    recentlyUsedKeys += recentKeys.length;
                }
            }
            
            console.log(`  Total API Keys: ${totalKeys}`);
            console.log(`  Keys used in last 30 days: ${recentlyUsedKeys}`);
            console.log(`  Unused keys: ${totalKeys - recentlyUsedKeys}`);
        }

    } catch (error) {
        console.error('An unexpected error occurred:', error);
    }
}

fetchOpenAIAdminData();
