import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const Z_AI_API_KEY = process.env.Z_AI_API_KEY;
const Z_AI_BASE_URL = 'https://api.z.ai/api/anthropic';
const GLM_MODEL = 'glm-5';

const N8N_BASE_URL = 'http://85.239.59.252:5678/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY;

const AGENTS_DIR = 'C:/Users/хост/.claude/skills/agents';

const client = new Anthropic({
  apiKey: Z_AI_API_KEY,
  baseURL: Z_AI_BASE_URL,
});

// n8n REST API tools available to GLM-5
const n8nTools = [
  {
    name: 'n8n_get_workflow',
    description: 'Get a workflow from n8n by ID. Returns full workflow JSON with nodes and connections.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: 'The workflow ID' }
      },
      required: ['workflow_id']
    }
  },
  {
    name: 'n8n_update_workflow',
    description: 'Update a workflow in n8n. Pass the complete workflow JSON including all nodes and connections.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: 'The workflow ID' },
        workflow: { type: 'object', description: 'Complete workflow object with nodes, connections, settings' }
      },
      required: ['workflow_id', 'workflow']
    }
  },
  {
    name: 'n8n_test_workflow',
    description: 'Execute a workflow manually to test it. Returns execution result.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: 'The workflow ID to test' }
      },
      required: ['workflow_id']
    }
  },
  {
    name: 'n8n_get_executions',
    description: 'Get recent executions of a workflow to check for errors.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: 'The workflow ID' },
        limit: { type: 'number', description: 'Number of executions to return (default 5)' }
      },
      required: ['workflow_id']
    }
  },
  {
    name: 'supabase_query',
    description: 'Query Supabase REST API. Use for reading table schema or checking data.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        query_params: { type: 'string', description: 'Query parameters e.g. ?select=*&limit=1' }
      },
      required: ['table']
    }
  },
  {
    name: 'n8n_update_partial_workflow',
    description: 'Update specific nodes or connections in a workflow without replacing the whole thing. Fetches current workflow, applies changes, then saves. Supported operations: updateNodeParams (update node parameters by name), addNode (add new node), removeNode (remove node by name), updateConnections (replace entire connections map).',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: 'The workflow ID' },
        operations: {
          type: 'array',
          description: 'List of operations to apply',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['updateNodeParams', 'addNode', 'removeNode', 'updateConnections'] },
              nodeName: { type: 'string', description: 'For updateNodeParams/removeNode: name of node to modify' },
              parameters: { type: 'object', description: 'For updateNodeParams: new parameters to merge into node' },
              node: { type: 'object', description: 'For addNode: full node object {id, name, type, typeVersion, position, parameters}' },
              connections: { type: 'object', description: 'For updateConnections: full connections map to replace' }
            },
            required: ['type']
          }
        }
      },
      required: ['workflow_id', 'operations']
    }
  }
];

// Execute n8n tool calls
async function executeTool(toolName, toolInput) {
  const headers = {
    'X-N8N-API-KEY': N8N_API_KEY,
    'Content-Type': 'application/json'
  };

  try {
    if (toolName === 'n8n_get_workflow') {
      const res = await fetch(`${N8N_BASE_URL}/workflows/${toolInput.workflow_id}`, { headers });
      const data = await res.json();
      return JSON.stringify(data, null, 2);
    }

    if (toolName === 'n8n_update_workflow') {
      const res = await fetch(`${N8N_BASE_URL}/workflows/${toolInput.workflow_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(toolInput.workflow)
      });
      const data = await res.json();
      return JSON.stringify(data, null, 2);
    }

    if (toolName === 'n8n_test_workflow') {
      // Activate then trigger manually
      const res = await fetch(`${N8N_BASE_URL}/workflows/${toolInput.workflow_id}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      const data = await res.json();
      return JSON.stringify(data, null, 2);
    }

    if (toolName === 'n8n_get_executions') {
      const limit = toolInput.limit || 5;
      const res = await fetch(`${N8N_BASE_URL}/executions?workflowId=${toolInput.workflow_id}&limit=${limit}`, { headers });
      const data = await res.json();
      return JSON.stringify(data, null, 2);
    }

    if (toolName === 'n8n_update_partial_workflow') {
      // Fetch current workflow
      const getRes = await fetch(`${N8N_BASE_URL}/workflows/${toolInput.workflow_id}`, { headers });
      const wf = await getRes.json();

      for (const op of toolInput.operations) {
        if (op.type === 'updateNodeParams') {
          const node = wf.nodes.find(n => n.name === op.nodeName);
          if (!node) return `Node not found: ${op.nodeName}`;
          node.parameters = { ...node.parameters, ...op.parameters };
        }
        if (op.type === 'addNode') {
          wf.nodes.push(op.node);
        }
        if (op.type === 'removeNode') {
          wf.nodes = wf.nodes.filter(n => n.name !== op.nodeName);
          // Remove connections referencing this node
          for (const src of Object.keys(wf.connections)) {
            if (src === op.nodeName) { delete wf.connections[src]; continue; }
            for (const port of wf.connections[src].main || []) {
              const filtered = (port || []).filter(c => c.node !== op.nodeName);
              port.splice(0, port.length, ...filtered);
            }
          }
        }
        if (op.type === 'updateConnections') {
          wf.connections = op.connections;
        }
      }

      const putRes = await fetch(`${N8N_BASE_URL}/workflows/${toolInput.workflow_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(wf)
      });
      const data = await putRes.json();
      return JSON.stringify({ success: putRes.ok, status: putRes.status, id: data.id, name: data.name }, null, 2);
    }

    if (toolName === 'supabase_query') {
      const supabaseUrl = 'https://jlenlqhudcgkmnxnkguk.supabase.co';
      const supabaseKey = 'SUPABASE_KEY_PLACEHOLDER';
      const params = toolInput.query_params || '?select=*&limit=3';
      const res = await fetch(`${supabaseUrl}/rest/v1/${toolInput.table}${params}`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });
      const data = await res.json();
      return JSON.stringify(data, null, 2);
    }

    return `Unknown tool: ${toolName}`;
  } catch (err) {
    return `Tool error: ${err.message}`;
  }
}

// Read agent prompt from file
function readAgentPrompt(agentName) {
  const filePath = path.join(AGENTS_DIR, `${agentName}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent prompt not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

// Run GLM-5 agent with tool loop
async function runAgent(agentName, task) {
  const agentPrompt = readAgentPrompt(agentName);

  const systemPrompt = `${agentPrompt}

---
ТЕКУЩАЯ ЗАДАЧА: ${task}

Используй доступные инструменты для выполнения задачи. Когда закончишь — сообщи результат лиду в формате указанном в разделе "КАК ОТЧИТАТЬСЯ ЛИДУ".`;

  const messages = [
    { role: 'user', content: 'Приступай к выполнению задачи.' }
  ];

  let iterations = 0;
  const MAX_ITERATIONS = 40;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: GLM_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: n8nTools,
      messages
    });

    // Add assistant response to history
    messages.push({ role: 'assistant', content: response.content });

    // Check stop reason — handle both Anthropic ('end_turn') and OpenAI-style ('stop') formats
    const stopReason = response.stop_reason;
    const hasToolUse = response.content.some(b => b.type === 'tool_use');

    if (hasToolUse) {
      // Execute all tool calls
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    if (stopReason === 'end_turn' || stopReason === 'stop' || stopReason === 'stop_sequence') {
      // Extract final text
      const textBlocks = response.content.filter(b => b.type === 'text');
      return textBlocks.map(b => b.text).join('\n');
    }

    // max_tokens or other — return whatever text we have
    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length > 0) return textBlocks.map(b => b.text).join('\n');
    break;
  }

  return `Агент завершил работу после ${iterations} итераций.`;
}

// MCP Server setup
const server = new Server(
  { name: 'agent-runner', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'run_subagent',
      description: 'Run a subagent (GLM-5) to configure an n8n workflow. The agent reads its prompt from the agents directory and uses n8n REST API tools.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_name: {
            type: 'string',
            enum: ['agent_02', 'agent_03', 'agent_03_5', 'agent_04', 'agent_06'],
            description: 'Which agent to run'
          },
          task: {
            type: 'string',
            description: 'Specific task description for the agent'
          }
        },
        required: ['agent_name', 'task']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'run_subagent') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { agent_name, task } = request.params.arguments;

  try {
    const result = await runAgent(agent_name, task);
    return {
      content: [{ type: 'text', text: result }]
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Ошибка агента: ${err.message}` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
