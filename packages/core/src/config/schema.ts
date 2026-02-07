export type TransportType = 'stdio' | 'http';
export type DbMode = 'global' | 'repository';

export interface AgentConfig {
  runtime?: string;
  autoSetup?: boolean;
}

export interface CawConfig {
  transport?: TransportType;
  port?: number;
  dbMode?: DbMode;
  agent?: AgentConfig;
}

const VALID_TRANSPORTS = new Set(['stdio', 'http']);
const VALID_DB_MODES = new Set(['global', 'repository']);

export interface ValidationResult {
  valid: boolean;
  config: CawConfig;
  warnings: string[];
}

export function validateConfig(raw: unknown): ValidationResult {
  const warnings: string[] = [];
  const config: CawConfig = {};

  if (raw === null || typeof raw !== 'object') {
    return { valid: false, config, warnings: ['Config must be a JSON object'] };
  }

  const obj = raw as Record<string, unknown>;

  if (obj.transport !== undefined) {
    if (typeof obj.transport === 'string' && VALID_TRANSPORTS.has(obj.transport)) {
      config.transport = obj.transport as TransportType;
    } else {
      warnings.push(`Invalid transport: '${String(obj.transport)}'. Must be 'stdio' or 'http'.`);
    }
  }

  if (obj.port !== undefined) {
    if (
      typeof obj.port === 'number' &&
      Number.isInteger(obj.port) &&
      obj.port >= 1 &&
      obj.port <= 65535
    ) {
      config.port = obj.port;
    } else {
      warnings.push(`Invalid port: '${String(obj.port)}'. Must be an integer between 1 and 65535.`);
    }
  }

  if (obj.dbMode !== undefined) {
    if (typeof obj.dbMode === 'string' && VALID_DB_MODES.has(obj.dbMode)) {
      config.dbMode = obj.dbMode as DbMode;
    } else {
      warnings.push(`Invalid dbMode: '${String(obj.dbMode)}'. Must be 'global' or 'repository'.`);
    }
  }

  if (obj.agent !== undefined) {
    if (obj.agent !== null && typeof obj.agent === 'object') {
      const agent = obj.agent as Record<string, unknown>;
      const agentConfig: AgentConfig = {};

      if (agent.runtime !== undefined) {
        if (typeof agent.runtime === 'string') {
          agentConfig.runtime = agent.runtime;
        } else {
          warnings.push(`Invalid agent.runtime: must be a string.`);
        }
      }

      if (agent.autoSetup !== undefined) {
        if (typeof agent.autoSetup === 'boolean') {
          agentConfig.autoSetup = agent.autoSetup;
        } else {
          warnings.push(`Invalid agent.autoSetup: must be a boolean.`);
        }
      }

      config.agent = agentConfig;
    } else {
      warnings.push('Invalid agent: must be an object.');
    }
  }

  return { valid: warnings.length === 0, config, warnings };
}
