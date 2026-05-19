import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadKnowledgeBase } from './lib/chunker.js';
import { buildIndex, loadIndex } from './lib/embeddings.js';
import { retrieve } from './lib/retriever.js';
import { checkGuardrail } from './lib/guardrail.js';
import { buildVpsContext, getDetectedToolNames } from './lib/context-builder.js';
import { askLLM } from './lib/llm.js';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT         = process.env.RAG_PORT || 3002;
const KB_PATH      = process.env.KNOWLEDGE_BASE_PATH
  ? path.resolve(process.env.KNOWLEDGE_BASE_PATH)
  : path.join(__dirname, 'knowledge-base');
const INDEX_PATH   = process.env.INDEX_PATH
  ? path.resolve(process.env.INDEX_PATH)
  : path.join(__dirname, 'index', 'knowledge-index.json');
const TOP_K        = parseInt(process.env.RAG_TOP_K || '5');
const BACKEND_URL  = process.env.BACKEND_URL || 'http://backend:3001';

// ── Build or load the vector index ───────────────────────────────────────────
let knowledgeIndex;

function initIndex() {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      knowledgeIndex = loadIndex(INDEX_PATH);
      console.log(`[RAG] Loaded existing index from ${INDEX_PATH} (${knowledgeIndex.chunks.length} chunks)`);
    } else {
      console.log('[RAG] Building knowledge index...');
      const chunks = loadKnowledgeBase(KB_PATH);
      knowledgeIndex = buildIndex(chunks, INDEX_PATH);
      console.log(`[RAG] Index built: ${knowledgeIndex.chunks.length} chunks from ${fs.readdirSync(KB_PATH).filter(f => f.endsWith('.md')).length} files`);
    }
  } catch (err) {
    console.error('[RAG] Failed to initialize index:', err.message);
    knowledgeIndex = null;
  }
}

initIndex();

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/rag/health', (_req, res) => {
  res.json({
    ok: true,
    indexed: !!knowledgeIndex,
    chunks: knowledgeIndex?.chunks?.length || 0,
  });
});

// ── Rebuild index ─────────────────────────────────────────────────────────────
app.post('/rag/rebuild-index', (_req, res) => {
  try {
    if (fs.existsSync(INDEX_PATH)) fs.unlinkSync(INDEX_PATH);
    const chunks = loadKnowledgeBase(KB_PATH);
    knowledgeIndex = buildIndex(chunks, INDEX_PATH);
    res.json({ ok: true, chunks: knowledgeIndex.chunks.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Main RAG endpoint ─────────────────────────────────────────────────────────
app.post('/rag/ask', async (req, res) => {
  const { question, vps_id, session_id } = req.body || {};

  if (!question?.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  if (!knowledgeIndex) {
    return res.json({
      answer: "L'index de connaissance n'est pas disponible. Contacte l'administrateur.",
      commands: [], steps: [], sources: [], off_topic: false, error: true,
    });
  }

  // 1. Guardrail check
  const guard = await checkGuardrail(question);
  if (!guard.pass) return res.json(guard.response);

  // 2. Build VPS context
  const cookie = req.headers.cookie || '';
  let vpsContext = '';
  let detectedTools = [];
  let suggestedProjects = [];

  if (vps_id) {
    try {
      vpsContext = await buildVpsContext(vps_id, cookie);

      // Get detected tools for filtering
      const r = await fetch(`${BACKEND_URL}/api/vps/${vps_id}/detected-tools`, {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const data = await r.json();
        detectedTools = getDetectedToolNames(data);
      }

      // Get suggested projects
      const pr = await fetch(`${BACKEND_URL}/api/vps/${vps_id}/detected-projects`, {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(4000),
      });
      if (pr.ok) {
        const pdata = await pr.json();
        suggestedProjects = (pdata.projects || []).map(p => p.project_name);
      }
    } catch {}
  }

  // 3. Retrieve relevant chunks
  const chunks = retrieve(knowledgeIndex, question, detectedTools, TOP_K);

  // 4. Call LLM
  try {
    const result = await askLLM(question, vpsContext, chunks, suggestedProjects);
    result.vps_context_used = !!vpsContext;
    return res.json(result);
  } catch (err) {
    console.error('[RAG] LLM error:', err.message);
    return res.json({
      answer: `Erreur lors de la génération de la réponse : ${err.message}`,
      commands: [], steps: [], sources: [], off_topic: false, error: true,
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ RAG DevOps Assistant running on http://localhost:${PORT}`);
  console.log(`📚 Knowledge base: ${KB_PATH}`);
  console.log(`🔍 Index: ${INDEX_PATH}\n`);
});
