const { Server } = require('@modelcontextprotocol/sdk/dist/cjs/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/dist/cjs/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/dist/cjs/types.js');
const Anthropic = require('@anthropic-ai/sdk').default;
const fs = require('fs');
const path = require('path');

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
  }
];

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

function readAgentPrompt(agentName) {
  const filePath = path.join(AGENTS_DIR, `${agentName}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent prompt not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

async function runAgent(agentName, task) {
  const agentPrompt = readAgentPrompt(agentName);
  const systemPrompt = `${agentPrompt}\n\n---\nТЕКУЩАЯ ЗАДАЧА: ${task}\n\nИспользуй доступные инструменты для выполнения задачи. Когда закончишь — сообщи результат лиду в формате указанном в разделе "КАК ОТЧИТАТЬСЯ ЛИДУ".`;

  const messages = [{ role: 'user', content: 'Приступай к выполнению задачи.' }];
  let iterations = 0;
  const MAX_ITERATIONS = 20;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await client.messages.create({
      model: GLM_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: n8nTools,
      messages
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter(b => b.type === 'text');
      return textBlocks.map(b => b.text).join('\n');
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }
    break;
  }
  return `Агент завершил работу после ${iterations} итераций.`;
}

const server = new Server(
  { name: 'agent-runner', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'run_subagent',
    description: 'Run a subagent (GLM-5) to configure an n8n workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_name: { type: 'string', enum: ['agent_02', 'agent_03', 'agent_03_5', 'agent_06'] },
        task: { type: 'string' }
      },
      required: ['agent_name', 'task']
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'run_subagent') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }
  const { agent_name, task } = request.params.arguments;
  try {
    const result = await runAgent(agent_name, task);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Ошибка агента: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
