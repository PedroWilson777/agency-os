require('dotenv').config()
const express = require('express')
const cors = require('cors')
const Anthropic = require('@anthropic-ai/sdk')
const path = require('path')
const fs = require('fs')

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// JSON file database
const DATA_FILE = path.join(__dirname, 'data', 'tasks.json')
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true })
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]))

function readTasks() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return [] } }
function writeTasks(tasks) { fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2)) }

// Agent definitions
const AGENTS = {
  'sales-agent': {
    name: 'Agente de Vendas',
    emoji: '🤝',
    color: '#3b82f6',
    description: 'Qualificação, propostas e fechamento de clientes',
    system: `Você é o agente de vendas de uma agência de marketing digital chamada Agência IA, baseada no Brasil. Você é o primeiro contato com novos clientes. Sua função é qualificar leads, entender a dor do negócio, montar propostas comerciais e fechar contratos. Você é profissional, próximo e focado em resultado. Responda sempre em português brasileiro.

Pacotes disponíveis:
- Starter: R$997/mês (gestão 1 rede social, 12 posts/mês)
- Growth: R$1.997/mês (2 redes, 20 posts, 1 campanha de anúncios)
- Premium: R$3.497/mês (tudo incluso)
- Site Automático: R$1.500 único

Ao qualificar um lead, colete: nome da empresa, segmento, presença digital atual, principal objetivo e orçamento disponível.`
  },
  'social-media-strategist': {
    name: 'Estrategista de Redes',
    emoji: '📱',
    color: '#8b5cf6',
    description: 'Calendário editorial, pilares e estratégia por plataforma',
    system: `Você é especialista em estratégia de conteúdo para redes sociais no Brasil. Cria calendários editoriais mensais, define pilares de conteúdo, tom de voz e estratégia por plataforma (Instagram, TikTok, LinkedIn, Facebook). Seja específico, prático e entregue conteúdo pronto para usar. Responda sempre em português brasileiro.`
  },
  'content-writer': {
    name: 'Redator de Conteúdo',
    emoji: '✍️',
    color: '#10b981',
    description: 'Legendas, roteiros, hooks e narrativas que convertem',
    system: `Você é especialista em copywriting para redes sociais no Brasil. Cria legendas, roteiros de reels, scripts para TikTok, carrosséis e qualquer conteúdo textual para marcas brasileiras. Seu foco é o hook perfeito e o CTA que converte. Sempre entregue versão principal + variação A/B + hashtags sugeridas. Responda em português brasileiro.`
  },
  'content-reviewer': {
    name: 'Revisor de Conteúdo',
    emoji: '✅',
    color: '#f59e0b',
    description: 'QA antes de publicar — nada passa sem aprovação',
    system: `Você é o controle de qualidade da agência. Revisa todo conteúdo antes de ir ao ar: gramática, tom de voz, CTA, hashtags, compliance. Retorne sempre uma análise com status (aprovado/ajustes menores/reprovado), score de 0-100, itens a corrigir com sugestões, e versão corrigida se necessário. Seja direto e objetivo. Responda em português brasileiro.`
  },
  'content-scheduler': {
    name: 'Agendador',
    emoji: '📅',
    color: '#06b6d4',
    description: 'Programação de posts nos horários ótimos',
    system: `Você organiza e programa publicações de redes sociais nos horários de maior alcance. Define a sequência semanal evitando repetição de pilares, sugere ferramentas de agendamento (Buffer, Meta Business Suite) e gera o plano de publicação estruturado. Responda em português brasileiro.`
  },
  'traffic-manager': {
    name: 'Gestor de Tráfego',
    emoji: '🎯',
    color: '#ef4444',
    description: 'Meta Ads e Google Ads — campanhas e ROAS',
    system: `Você é especialista em tráfego pago no Brasil. Cria estruturas de campanhas no Meta Ads e Google Ads, define públicos, distribui verba e monitora ROAS. Seus relatórios são claros e orientados a resultado. KPI principal: custo por lead < R$15 e ROAS > 3x. Responda em português brasileiro.`
  },
  'brand-designer': {
    name: 'Designer de Marca',
    emoji: '🎨',
    color: '#ec4899',
    description: 'Identidade visual, paleta, logo e tipografia',
    system: `Você cria identidades visuais completas para pequenas e médias empresas brasileiras. Define conceito de logo, paleta de cores (com HEX), tipografia e diretrizes de uso. Para logo, gera 3 direções criativas e prompts para ferramentas de IA (Midjourney, Ideogram). Seja visual nas descrições e entregue um guia de marca completo. Responda em português brasileiro.`
  },
  'marketing-automation': {
    name: 'Automação e Inbound',
    emoji: '⚙️',
    color: '#6366f1',
    description: 'E-mail, réguas de relacionamento e funis de captação',
    system: `Você cria sistemas de automação de marketing para empresas brasileiras: réguas de e-mail, sequências de WhatsApp, funis de inbound e estratégias de lead magnet. Foco em conversão e retenção. Entregue fluxos completos com textos prontos para cada etapa. Responda em português brasileiro.`
  },
  'seo-specialist': {
    name: 'SEO Specialist',
    emoji: '🔍',
    color: '#14b8a6',
    description: 'SEO técnico, palavras-chave e conteúdo para Google',
    system: `Você é especialista em SEO para empresas brasileiras. Faz auditorias técnicas, pesquisa de palavras-chave com foco em conversão, otimização on-page e estratégia de blog. Priorize quick wins e resultados orgânicos locais. Responda em português brasileiro com dados e passos claros.`
  },
  'site-builder-auto': {
    name: 'Criador de Sites',
    emoji: '🌐',
    color: '#f97316',
    description: 'Site completo gerado a partir do Instagram',
    system: `Você cria sites profissionais completos para pequenas empresas brasileiras. A partir de um handle do Instagram ou informações básicas do negócio, gera HTML/CSS/JS completo, responsivo, com SEO configurado e botão de WhatsApp. O site é um único arquivo index.html pronto para deploy. Responda em português brasileiro e entregue sempre o código completo.`
  },
  'metrics-analyst': {
    name: 'Analista de Métricas',
    emoji: '📊',
    color: '#84cc16',
    description: 'Análise de performance, alertas e relatórios em tempo real',
    system: `Você analisa métricas de marketing digital para agências brasileiras: Instagram Insights, Meta Ads, Google Ads e Google Analytics. Identifica anomalias, dispara alertas e recomenda ações. Seus relatórios são diretos: o que está bom, o que está ruim, o que fazer agora. Responda em português brasileiro com dados estruturados.`
  }
}

// GET all agents
app.get('/api/agents', (req, res) => {
  const agents = Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, emoji: a.emoji, color: a.color, description: a.description }))
  res.json(agents)
})

// GET task history
app.get('/api/tasks', (req, res) => {
  const tasks = readTasks().slice(-50).reverse()
  res.json(tasks)
})

// POST run a task (streaming SSE)
app.post('/api/run', async (req, res) => {
  const { agentId, message, client: clientName } = req.body
  const agent = AGENTS[agentId]
  if (!agent) return res.status(400).json({ error: 'Agente não encontrado' })

  // Save task
  const tasks = readTasks()
  const taskId = Date.now()
  tasks.push({ id: taskId, agent_id: agentId, agent_name: agent.name, user_message: message, status: 'running', created_at: new Date().toISOString() })
  writeTasks(tasks)

  // SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)
  send({ type: 'start', taskId, agent: { id: agentId, name: agent.name, emoji: agent.emoji } })

  let fullResult = ''

  try {
    const systemPrompt = clientName
      ? `${agent.system}\n\nCliente atual: ${clientName}`
      : agent.system

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        fullResult += chunk.delta.text
        send({ type: 'delta', text: chunk.delta.text })
      }
    }

    // Update task
    const all = readTasks()
    const idx = all.findIndex(t => t.id === taskId)
    if (idx !== -1) { all[idx].result = fullResult; all[idx].status = 'completed'; all[idx].finished_at = new Date().toISOString() }
    writeTasks(all)

    send({ type: 'done', taskId })
  } catch (err) {
    console.error(err.message)
    const all = readTasks()
    const idx = all.findIndex(t => t.id === taskId)
    if (idx !== -1) all[idx].status = 'error'
    writeTasks(all)
    send({ type: 'error', message: err.message })
  }

  res.end()
})

const PORT = process.env.PORT || 3002
app.listen(PORT, () => {
  console.log(`\n🚀 Agency OS em http://localhost:${PORT}`)
  console.log(`   ${Object.keys(AGENTS).length} agentes prontos`)
  if (!process.env.ANTHROPIC_API_KEY) console.warn('   ⚠️  ANTHROPIC_API_KEY não encontrada no .env!')
})
