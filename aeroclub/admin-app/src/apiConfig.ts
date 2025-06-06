// src/apiConfig.ts

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

export { API_BASE_URL };

console.log(`API Base URL set to: ${API_BASE_URL}`);
