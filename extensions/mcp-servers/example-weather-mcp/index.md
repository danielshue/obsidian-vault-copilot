---
layout: extension
identifier: "example-weather-mcp"
title: "Weather MCP Server"
type: mcp-server
version: "1.0.0"
description: "Example MCP server integration that provides weather data for your notes and daily planning."
author: "Dan Shue"
author_url: "https://danielshue.com"
icon: "extensions/mcp-servers/example-weather-mcp/icon.svg"
categories: ["Integration", "MCP", "Utility"]
tags: ["weather", "mcp", "api", "daily-notes", "planning"]
size: "64.1 KB"
versions:
  - version: "1.0.0"
    date: "2026-02-01"
    changes:
      - "Initial release"
      - "Current weather data integration"
      - "Forecast support for daily planning"
      - "Location-based weather lookup"
---


## Features

- 🌤️ **Current Weather** - Get current conditions for any location
- 📅 **Forecasts** - Multi-day weather forecasts
- 📝 **Note Integration** - Add weather to daily notes automatically
- 🌍 **Any Location** - Works worldwide with city names or coordinates

## Prerequisites

This extension requires:
- Node.js 18+ installed on your system
- An OpenWeather API key (free tier available)

## Installation

1. Install via the Extension Browser in Vault Copilot
2. Set your OpenWeather API key as an environment variable:
   
   **Windows (PowerShell):**
   ```powershell
   $env:OPENWEATHER_API_KEY = "<your-key>"
   ```
   
   **macOS/Linux:**
   ```bash
   export OPENWEATHER_API_KEY="<your-key>"
   ```

3. Restart Obsidian to load the MCP server

## Getting an API Key

1. Visit [OpenWeather](https://openweathermap.org/api)
2. Sign up for a free account
3. Navigate to "API Keys" in your account
4. Generate a new API key
5. Add it to your environment variables

## Usage

Once configured, you can use weather tools in your conversations:

> "What's the weather like in Seattle today?"

> "Add the current weather to my daily note"

> "Is it going to rain this weekend in London?"

## Configuration

The MCP server configuration is added to your vault's `.obsidian/` folder:

```json
{
  "mcpServers": {
    "weather": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-weather"],
      "env": {
        "OPENWEATHER_API_KEY": "${OPENWEATHER_API_KEY}"
      }
    }
  }
}
```

## Available Tools

When this MCP server is active, the following tools become available:

| Tool | Description |
|------|-------------|
| `get_current_weather` | Get current weather conditions |
| `get_forecast` | Get multi-day weather forecast |

## Troubleshooting

### "MCP server not starting"
- Ensure Node.js 18+ is installed: `node --version`
- Verify your API key is set correctly
- Check Obsidian's console for error messages

### "API key invalid"
- Confirm your OpenWeather API key is active
- Free tier keys may take a few hours to activate

### "Location not found"
- Try using the full city name with country: "London, UK"
- Use coordinates for precise locations

## Security Note

Your API key is stored as an environment variable and never written to files in your vault. The MCP server accesses it at runtime only.

## Changelog

### v1.0.0 (2026-02-01)
- Initial release
- Current weather support
- Forecast support

## License

MIT
