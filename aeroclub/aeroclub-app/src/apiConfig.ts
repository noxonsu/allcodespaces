// src/apiConfig.ts

let determinedApiBaseUrl: string;

const localApiBaseUrl = 'http://localhost:8000';
const codespaceHostSuffix = '.app.github.dev';

if (typeof window !== 'undefined' && window.location.hostname.endsWith(codespaceHostSuffix)) {
  // We are in a GitHub Codespace
  // The hostname is like: CODESPACENAME-FRONTENDPORT.app.github.dev
  // We need to construct the backend URL, assuming it's on port 8000
  const currentHostname = window.location.hostname; // e.g., shiny-space-carnival-7rx5q9q755hx4p7-3000.app.github.dev
  const parts = currentHostname.split('-');
  
  if (parts.length > 2) {
    // Remove the port part (e.g., -3000) and then reconstruct
    const codespaceNameWithPotentialPort = parts.slice(0, -1).join('-'); // e.g., shiny-space-carnival-7rx5q9q755hx4p7
    // Ensure we correctly isolate the base codespace name if it itself contains hyphens
    // The structure is typically {codespacename}-{port}.{domain}
    // A more robust way to get the base name might be needed if codespace names are very complex,
    // but for typical names, this should work.
    // Or, more simply, replace the port part of the hostname.
    const codespaceBaseName = currentHostname.substring(0, currentHostname.indexOf(codespaceHostSuffix));
    // Replace the current port (e.g. -3000) with -8000 for the backend
    const backendPort = '8000';
    // Find the last hyphen before .app.github.dev, which usually separates the name and frontend port
    const lastHyphenIndex = codespaceBaseName.lastIndexOf('-');
    let baseNameWithoutPort = codespaceBaseName;
    if (lastHyphenIndex > 0) {
        // Check if the part after lastHyphen is numeric (a port)
        const potentialPort = codespaceBaseName.substring(lastHyphenIndex + 1);
        if (!isNaN(Number(potentialPort))) {
            baseNameWithoutPort = codespaceBaseName.substring(0, lastHyphenIndex);
        }
    }
    determinedApiBaseUrl = `https://${baseNameWithoutPort}-${backendPort}${codespaceHostSuffix}`;
  } else {
    // Fallback if hostname parsing is unexpected, though unlikely for Codespaces
    console.warn("Could not determine Codespace base name accurately, falling back to localhost for API.");
    determinedApiBaseUrl = localApiBaseUrl;
  }
} else {
  // Not in Codespaces (or window is not defined, e.g. SSR, though not relevant for CRA)
  determinedApiBaseUrl = localApiBaseUrl;
}

export const API_BASE_URL = determinedApiBaseUrl;

console.log(`API Base URL set to: ${API_BASE_URL}`);
