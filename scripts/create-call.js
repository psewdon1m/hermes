#!/usr/bin/env node

/**
 * TGCall Link Generator
 * Creates a new video call and returns the shareable link
 */

const https = require('https');
const http = require('http');

// Load environment variables (dotenv is optional)
try {
    require('dotenv').config();
} catch (e) {
    // dotenv not available, use system environment variables
}

// Configuration
const CONFIG = {
    // Change this to your domain
    domain: process.env.DOMAIN || 'tgcall.us',
    // Backend API endpoint
    apiEndpoint: '/create',
    // Use HTTPS in production
    useHttps: process.env.NODE_ENV === 'production' || process.env.USE_HTTPS === 'true'
};

class CallLinkGenerator {
    constructor() {
        // For local development, use localhost with backend port
        if (CONFIG.domain === 'tgcall.us' || CONFIG.domain === 'localhost') {
            this.baseUrl = `http://localhost:3001`;
        } else {
            this.baseUrl = CONFIG.useHttps ? 
                `https://${CONFIG.domain}` : 
                `http://${CONFIG.domain}`;
        }
    }

    async createCall() {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}${CONFIG.apiEndpoint}`;
            const protocol = this.baseUrl.startsWith('https') ? https : http;
            
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TGCall-LinkGenerator/1.0'
                }
            };

            const req = protocol.request(url, options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (res.statusCode === 200) {
                            resolve(response);
                        } else {
                            reject(new Error(`API Error: ${response.error || 'Unknown error'}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    formatOutput(callData) {
        const output = `
🎥 TGCall Link Generated Successfully!

📞 Call ID: ${callData.callId}
🔗 Shareable Link: ${callData.url}
📊 Status: ${callData.status}

💡 Instructions:
1. Share this link with the person you want to call
2. Both participants will join the same call room
3. The call will expire after 60 minutes of inactivity
4. Maximum 2 participants per call

🌐 Web Interface: ${this.baseUrl}
`;

        return output;
    }

    async generate() {
        try {
            console.log('🚀 Creating new video call...');
            const callData = await this.createCall();
            console.log(this.formatOutput(callData));
            
            // Copy to clipboard if possible
            this.copyToClipboard(callData.url);
            
            return callData;
        } catch (error) {
            console.error('❌ Error creating call:', error.message);
            process.exit(1);
        }
    }

    copyToClipboard(text) {
        try {
            const { execSync } = require('child_process');
            
            // Try different clipboard commands based on OS
            const commands = [
                'clip',           // Windows
                'pbcopy',         // macOS
                'xclip -selection clipboard', // Linux with xclip
                'xsel --clipboard --input'    // Linux with xsel
            ];

            for (const cmd of commands) {
                try {
                    execSync(`echo "${text}" | ${cmd}`, { stdio: 'ignore' });
                    console.log('📋 Link copied to clipboard!');
                    return;
                } catch (e) {
                    // Try next command
                }
            }
        } catch (error) {
            // Clipboard copy failed, that's okay
        }
    }
}

// CLI Interface
if (require.main === module) {
    const generator = new CallLinkGenerator();
    
    // Handle command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
TGCall Link Generator

Usage: node create-call.js [options]

Options:
  --help, -h     Show this help message
  --domain       Override domain (default: ${CONFIG.domain})
  --http         Use HTTP instead of HTTPS
  --api          Override API endpoint

Examples:
  node create-call.js
  node create-call.js --domain mydomain.com
  node create-call.js --http
        `);
        process.exit(0);
    }

    // Parse arguments
    const domainIndex = args.indexOf('--domain');
    if (domainIndex !== -1 && args[domainIndex + 1]) {
        CONFIG.domain = args[domainIndex + 1];
    }

    if (args.includes('--http')) {
        CONFIG.useHttps = false;
    }

    const apiIndex = args.indexOf('--api');
    if (apiIndex !== -1 && args[apiIndex + 1]) {
        CONFIG.apiEndpoint = args[apiIndex + 1];
    }

    generator.generate();
}

module.exports = CallLinkGenerator;
