# MCP Configuration Guide for ATCLI

To connect VS Code or Antigravity to the ATCLI Local Broker, you need to configure their respective MCP settings to point to the local server.

## 1. Antigravity IDE
In Antigravity, add this to your server configuration:

```json
{
  "mcpServers": {
    "atcli-broker": {
      "command": "node",
      "args": ["c:/Users/manit/Downloads/cli test/atcli-core/dist/broker/cli-entry.js"]
    }
  }
}
```

## 2. VS Code (Claude Code / Cursor)
For extensions that support the Model Context Protocol, configure the transport to point to the local node script once you build it:

```json
{
  "mcpServers": {
    "atcli": {
      "command": "node",
      "args": ["c:/Users/manit/Downloads/cli test/atcli-core/dist/broker/cli-entry.js"]
    }
  }
}
```

*(Note: `dist/broker/cli-entry.js` is a placeholder for where you will expose the MCP SDK STDIO transport in future iterations).*
