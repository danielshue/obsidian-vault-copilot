---
layout: docs
title: MCP apps
permalink: /docs/mcp-apps/
---

# MCP Apps - Interactive UIs in Chat

The Obsidian Vault Copilot plugin now supports **MCP Apps**, a protocol extension that enables interactive HTML UIs to be rendered inline within the chat interface. This feature is based on the [MCP Apps specification (SEP-1865)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx).

## Overview

MCP Apps allow MCP servers to provide rich, interactive experiences beyond simple text responses. When a tool with an associated UI resource is called, its result can be rendered as an embedded HTML application directly in the chat.

### Key Features

- **Interactive HTML UIs**: Full HTML/CSS/JavaScript apps rendered inline
- **Sandboxed Execution**: Apps run in secure sandboxed iframes
- **Bidirectional Communication**: Apps can communicate with the host via JSON-RPC
- **Theme Integration**: Apps receive Obsidian's theme colors and adapt accordingly
- **Tool Proxying**: Apps can call server tools directly from the UI

## How It Works

### 1. Server Declares UI Resources

MCP servers declare UI resources using the `ui://` URI scheme:

```json
{
  "resources": [
    {
      "uri": "ui://my-server/dashboard",
      "name": "My Dashboard",
      "mimeType": "text/html;profile=mcp-app"
    }
  ]
}
```

### 2. Tools Link to UI Resources

Tools declare their associated UI via `_meta.ui.resourceUri`:

```json
{
  "name": "analyze_data",
  "description": "Analyze data and show results",
  "_meta": {
    "ui": {
      "resourceUri": "ui://my-server/dashboard"
    }
  }
}
```

### 3. UI Renders When Tool Completes

When the tool is called and completes, Vault Copilot:
1. Fetches the HTML content from the UI resource
2. Renders it in a sandboxed iframe
3. Sends tool input/output data to the app

### 4. Apps Communicate via JSON-RPC

Apps use `postMessage` with JSON-RPC 2.0 protocol:

```javascript
// Initialize the app
parent.postMessage(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'ui/initialize',
  params: {}
}), '*');

// Call a tool
parent.postMessage(JSON.stringify({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'search_notes',
    arguments: { query: 'project' }
  }
}), '*');
```

## Demo Command

Try the MCP Apps feature with the built-in demo command:

```
/demo-app
```

This renders a sample interactive app that demonstrates:
- Initialization handshake
- Theme integration
- Tool calling from the UI

## Building MCP Apps

### Basic App Structure

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      /* Use CSS variables provided by the host */
      font-family: var(--font-sans, system-ui);
      background: var(--color-background-primary, #1e1e1e);
      color: var(--color-text-primary, #dcddde);
    }
  </style>
</head>
<body>
  <div id="content">Loading...</div>
  <script>
    // Initialize
    let initialized = false;
    
    window.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      
      // Handle initialize response
      if (msg.id === 1 && msg.result) {
        initialized = true;
        document.getElementById('content').textContent = 'Ready!';
      }
      
      // Handle tool input notification
      if (msg.method === 'ui/notifications/tool-input') {
        // Tool is being called, show loading state
      }
      
      // Handle tool result notification
      if (msg.method === 'ui/notifications/tool-result') {
        // Update UI with result data
        console.log('Result:', msg.params);
      }
    });
    
    // Send initialize request
    parent.postMessage(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'ui/initialize',
      params: {}
    }), '*');
  </script>
</body>
</html>
```

### Available Theme Variables

The host provides these CSS variables for theming:

| Variable | Description |
|----------|-------------|
| `--color-background-primary` | Primary background color |
| `--color-background-secondary` | Secondary background color |
| `--color-text-primary` | Primary text color |
| `--color-text-secondary` | Muted text color |
| `--color-border-primary` | Border color |
| `--font-sans` | Sans-serif font family |
| `--font-mono` | Monospace font family |
| `--border-radius-sm/md/lg` | Border radius sizes |

### JSON-RPC Methods

#### From App to Host

| Method | Description |
|--------|-------------|
| `ui/initialize` | Initialize the app condition, receive host context |
| `tools/call` | Call a tool on the MCP server |
| `ui/openLink` | Request to open a URL |
| `logging/message` | Send a log message to the host |
| `ui/notifications/size-changed` | Notify host of size change |

#### From Host to App

| Method | Description |
|--------|-------------|
| `ui/notifications/tool-input` | Tool is being called with arguments |
| `ui/notifications/tool-result` | Tool completed with result |
| `ui/notifications/context-changed` | Host context changed (theme, etc.) |

## Example MCP Server

See the complete example in [`examples/mcp-weather-app/`](../examples/mcp-weather-app/) which demonstrates:

- Declaring UI resources
- Linking tools to UI
- Building an interactive weather dashboard
- Handling JSON-RPC communication

## Security

MCP Apps are rendered in sandboxed iframes with restricted capabilities:

- `sandbox="allow-scripts"` - JavaScript is allowed
- No same-origin access unless explicitly permitted
- CSP is enforced based on server metadata
- Tool calls are proxied through the host

Apps cannot:
- Access the parent page's DOM
- Make arbitrary network requests without CSP allowance
- Access local storage or cookies of the host
- Execute code outside their sandbox

## Limitations

- Apps require a compliant MCP server that declares UI resources
- HTML content is sanitized and CSP-enforced
- Maximum iframe height is limited to prevent excessive scrolling
- Some features like camera/microphone require explicit permission grants

## Further Reading

- [MCP Apps Specification (SEP-1865)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [Example MCP Server](../examples/mcp-weather-app/)
