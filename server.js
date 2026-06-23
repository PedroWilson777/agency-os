require('dotenv').config()
const express = require('express')
const cors = require('cors')
const Anthropic = require('@anthropic-ai/sdk')
const path = require('path')
const fs = require('fs')
const http = require('http')

const app = express()
app.use(cors())
app.use(express.json({ limit: '20mb' })) // accept base64 images
app.use(express.static(path.join(__dirname, 'public')))

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DATA_DIR = path.join(__dirname, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const TASKS_FILE = path.join(DATA_DIR, 'tasks.json')
if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, '[]')

function readTasks() { try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')) } catch { return [] } }
function writeTasks(t) { fs.writeFileSync(TASKS_FILE, JSON.stringify(t, null, 2)) }

// Proxy helper → Agency Dashboard (port 3001)
function dashboardRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const opts = {
      hostname: 'localhost', port: 3001, path: urlPath, method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }
    const req = http.request(opts, res => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({ success: false }) } })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// ── Agent definitions ─────────────────────────────────────────────────────────
const AGENTS = {
  'sales-agent': {
    name: 'Agente de Vendas', emoji: '🤝', color: '#3b82f6',
    description: 'Qualificação, propostas e fechamento de clientes',
    system: `Você é o agente de vendas de uma agência de marketing digital chamada Agência IA, baseada no Brasil. Qualifica leads, monta propostas e fecha contratos. Responda em português brasileiro.

Pacotes:
- Starter: R$997/mês (1 rede social, 12 posts/mês)
- Growth: R$1.997/mês (2 redes, 20 posts, 1 campanha de anúncios)
- Premium: R$3.497/mês (tudo incluso)
- Site Automático: R$1.500 único

Ao qualificar, colete: nome da empresa, segmento, presença digital, objetivo principal e orçamento disponível. Quando fechar uma venda, informe o pacote contratado claramente para ser registrado.`
  },
  'social-media-strategist': {
    name: 'Estrategista de Redes', emoji: '📱', color: '#8b5cf6',
    description: 'Calendário editorial, pilares e estratégia por plataforma',
    system: `Você é especialista em estratégia de conteúdo para redes sociais no Brasil. Cria calendários editoriais mensais, pilares de conteúdo, tom de voz e estratégia por plataforma. Se receber uma imagem do perfil ou feed do cliente, use essas informações para personalizar a estratégia. Responda em português brasileiro.`
  },
  'content-writer': {
    name: 'Redator de Conteúdo', emoji: '✍️', color: '#10b981',
    description: 'Legendas, roteiros, hooks e narrativas que convertem',
    system: `Você é especialista em copywriting para redes sociais no Brasil. Cria legendas, roteiros de reels, scripts para TikTok e carrosséis. Se receber imagem de um produto ou serviço, crie o conteúdo baseado nela. Entregue sempre: versão principal + variação A/B + hashtags. Responda em português brasileiro.`
  },
  'content-reviewer': {
    name: 'Revisor de Conteúdo', emoji: '✅', color: '#f59e0b',
    description: 'QA antes de publicar — nada passa sem aprovação',
    system: `Você é o controle de qualidade da agência. Revisa conteúdo antes de ir ao ar. Se receber imagem de um post, analise também o visual (texto, cores, logo, proporções). Retorne: status (aprovado/ajustes/reprovado), score 0-100, itens a corrigir e versão corrigida. Responda em português brasileiro.`
  },
  'content-scheduler': {
    name: 'Agendador', emoji: '📅', color: '#06b6d4',
    description: 'Programação de posts nos horários ótimos',
    system: `Você organiza publicações de redes sociais nos horários de maior alcance. Define sequência semanal, sugere ferramentas e gera o plano de publicação. Responda em português brasileiro.`
  },
  'traffic-manager': {
    name: 'Gestor de Tráfego', emoji: '🎯', color: '#ef4444',
    description: 'Meta Ads e Google Ads — campanhas e ROAS',
    system: `Você é especialista em tráfego pago no Brasil. Se receber imagem de resultados de campanha (print do gerenciador), analise os números e dê recomendações. Cria estruturas de campanhas no Meta Ads e Google Ads. KPI: CPL < R$15 e ROAS > 3x. Responda em português brasileiro.`
  },
  'brand-designer': {
    name: 'Designer de Marca', emoji: '🎨', color: '#ec4899',
    description: 'Identidade visual, paleta, logo e tipografia',
    system: `Você cria identidades visuais para empresas brasileiras. Se receber imagem de uma marca existente ou referência, analise e baseie sua criação nisso. Entregue: conceito de logo (3 direções), paleta de cores com HEX, tipografia, e prompts para Midjourney/Ideogram. Responda em português brasileiro.`
  },
  'marketing-automation': {
    name: 'Automação e Inbound', emoji: '⚙️', color: '#6366f1',
    description: 'E-mail, réguas de relacionamento e funis de captação',
    system: `Você cria automações de marketing para empresas brasileiras: réguas de e-mail, sequências de WhatsApp, funis de inbound. Entregue fluxos completos com textos prontos. Responda em português brasileiro.`
  },
  'seo-specialist': {
    name: 'SEO Specialist', emoji: '🔍', color: '#14b8a6',
    description: 'SEO técnico, palavras-chave e conteúdo para Google',
    system: `Você é especialista em SEO para empresas brasileiras. Se receber print de resultados do Search Console ou Analytics, analise os dados. Faz auditorias, pesquisa de palavras-chave e estratégia de blog. Responda em português brasileiro.`
  },
  'site-builder-auto': {
    name: 'Criador de Sites', emoji: '🌐', color: '#f97316',
    description: 'Site completo gerado a partir do Instagram',
    system: `Você cria sites profissionais completos para empresas brasileiras. Se receber imagem do perfil do Instagram, logo ou fotos do negócio, use-as para definir o estilo e cores do site. Gere HTML/CSS/JS completo em um único arquivo index.html, responsivo, com SEO e botão WhatsApp. Responda em português brasileiro.`
  },
  'metrics-analyst': {
    name: 'Analista de Métricas', emoji: '📊', color: '#84cc16',
    description: 'Análise de performance, alertas e relatórios em tempo real',
    system: `Você analisa métricas de marketing digital. Se receber prints de dashboards (Instagram Insights, Meta Ads, Google Analytics), leia os números da imagem e faça a análise. Identifica anomalias, gera alertas e recomenda ações. Responda em português brasileiro.`
  }
}

// ── API: Agents ───────────────────────────────────────────────────────────────
app.get('/api/agents', (req, res) => {
  res.json(Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, emoji: a.emoji, color: a.color, description: a.description })))
})

// ── API: Tasks history ────────────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => res.json(readTasks().slice(-50).reverse()))

// ── API: Clients (proxy to Dashboard) ────────────────────────────────────────
app.get('/api/clients', async (req, res) => {
  try {
    const r = await dashboardRequest('GET', '/api/clients')
    res.json(r.success ? r.data : [])
  } catch { res.json([]) }
})

app.post('/api/clients', async (req, res) => {
  try {
    const r = await dashboardRequest('POST', '/api/clients', req.body)
    res.json(r)
  } catch (e) { res.status(500).json({ success: false, error: e.message }) }
})

app.put('/api/clients/:id', async (req, res) => {
  try {
    const r = await dashboardRequest('PUT', `/api/clients/${req.params.id}`, req.body)
    res.json(r)
  } catch (e) { res.status(500).json({ success: false, error: e.message }) }
})

// ── API: Run agent (SSE streaming) ───────────────────────────────────────────
app.post('/api/run', async (req, res) => {
  const { agentId, message, clientName, image } = req.body // image = { data: base64, mediaType: 'image/jpeg' }
  const agent = AGENTS[agentId]
  if (!agent) return res.status(400).json({ error: 'Agente não encontrado' })

  // Save task
  const tasks = readTasks()
  const taskId = Date.now()
  tasks.push({ id: taskId, agent_id: agentId, agent_name: agent.name, user_message: message, status: 'running', created_at: new Date().toISOString() })
  writeTasks(tasks)

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`)
  send({ type: 'start', taskId, agent: { id: agentId, name: agent.name, emoji: agent.emoji } })

  let fullResult = ''

  const systemPrompt = clientName ? `${agent.system}\n\nCliente atual: ${clientName}` : agent.system
  let userContent
  if (image && image.data) {
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: image.mediaType || 'image/jpeg', data: image.data } },
      { type: 'text', text: message || 'Analise essa imagem.' }
    ]
  } else {
    userContent = message
  }

  // Modelos por agente: site/brand usam sonnet, resto usa haiku (mais rápido)
  const SONNET_AGENTS = ['site-builder-auto', 'brand-designer', 'content-writer', 'marketing-automation']
  const MODELS = [
    SONNET_AGENTS.includes(agentId) ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
    'claude-haiku-4-5-20251001',   // fallback 1
    'claude-sonnet-4-6'            // fallback 2
  ]

  const MAX_RETRIES = MODELS.length
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const model = MODELS[attempt - 1]
    try {
      if (attempt > 1) {
        const wait = 3000
        send({ type: 'delta', text: `⏳ Tentando modelo alternativo (${attempt}/${MAX_RETRIES})...\n\n` })
        await new Promise(r => setTimeout(r, wait))
        fullResult = ''
      }

      const stream = await claude.messages.stream({
        model,
        max_tokens: agentId === 'site-builder-auto' ? 8192 : 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          fullResult += chunk.delta.text
          send({ type: 'delta', text: chunk.delta.text })
        }
      }

      // Sucesso — salva
      const all = readTasks()
      const idx = all.findIndex(t => t.id === taskId)
      if (idx !== -1) { all[idx].result = fullResult; all[idx].status = 'completed'; all[idx].finished_at = new Date().toISOString() }
      writeTasks(all)

      // Se for site-builder, tenta extrair HTML e fazer deploy no Vercel
      if (agentId === 'site-builder-auto' && process.env.VERCEL_TOKEN) {
        try {
          const htmlMatch = fullResult.match(/```html\n([\s\S]*?)```/) || fullResult.match(/<!DOCTYPE html[\s\S]*?<\/html>/i)
          const htmlContent = htmlMatch ? (htmlMatch[1] || htmlMatch[0]) : null
          if (htmlContent) {
            send({ type: 'delta', text: '\n\n---\n🚀 **Fazendo deploy no Vercel automaticamente...**\n' })
            const siteName = (clientName || 'site-agencia-ia').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)
            const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
              method: 'POST',
              headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: `${siteName}-${Date.now()}`,
                files: [{ file: 'index.html', data: htmlContent }],
                projectSettings: { framework: null },
                target: 'production'
              })
            })
            const deployData = await deployRes.json()
            if (deployData.url) {
              const siteUrl = `https://${deployData.url}`
              send({ type: 'delta', text: `✅ **Site no ar!**\n\n🔗 [${siteUrl}](${siteUrl})\n\nCompartilhe esse link com o cliente — o site já está funcionando!` })
              if (idx !== -1) { all[idx].site_url = siteUrl; all[idx].result += `\n\nSite deployado: ${siteUrl}` }
              writeTasks(all)
            }
          }
        } catch (vercelErr) {
          console.error('Vercel deploy error:', vercelErr.message)
        }
      }

      send({ type: 'done', taskId })
      break

    } catch (err) {
      const isOverloaded = err.status === 529 || err.message?.toLowerCase().includes('overload') || err.error?.type === 'overloaded_error' || JSON.stringify(err).includes('overloaded')
      console.error(`Tentativa ${attempt} falhou: ${err.message}`)

      if (isOverloaded && attempt < MAX_RETRIES) {
        continue // vai para próxima tentativa
      }

      // Falha definitiva
      const all = readTasks()
      const idx = all.findIndex(t => t.id === taskId)
      if (idx !== -1) all[idx].status = 'error'
      writeTasks(all)

      const userMsg = isOverloaded
        ? '⚠️ A API da Anthropic está sobrecarregada no momento. Tente novamente em 1-2 minutos.'
        : `⚠️ Erro: ${err.message}`
      send({ type: 'error', message: userMsg })
      break
    }
  }

  res.end()
})

const PORT = process.env.PORT || 3002
app.listen(PORT, () => {
  console.log(`\n🚀 Agency OS → http://localhost:${PORT}`)
  console.log(`   ${Object.keys(AGENTS).length} agentes prontos`)
  if (!process.env.ANTHROPIC_API_KEY) console.warn('   ⚠️  ANTHROPIC_API_KEY ausente no .env!')
})
