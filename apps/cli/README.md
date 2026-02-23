# @caw/cli

Unified `caw` binary — headless MCP server, CLI commands, and combined API server.

## Modes

### Headless MCP Server

Run as an MCP server for Claude Code or other MCP clients.

```bash
caw --server                              # stdio transport (MCP only)
caw --server --transport http --port 3100  # HTTP: MCP + REST API + WebSocket
```

### CLI Commands

```bash
caw init [--yes] [--global]               # initialize caw config
caw setup claude-code                     # configure Claude Code MCP integration
caw run <workflow_id>                     # execute a workflow
caw run --prompt "..."                    # create + plan + run from prompt
caw work <issues...>                      # work on GitHub issues
caw pr list|check|merge|rebase|cycle      # PR lifecycle management
```

### Template Commands

```bash
caw --list-templates                           # list available templates
caw --template oauth-setup "Add OAuth to app"  # create workflow from template
```

## Dependencies

- **@caw/core** — Database layer and services
- **@caw/mcp-server** — MCP server
- **@caw/rest-api** — REST API and WebSocket
- **@caw/spawner** — Agent spawning
