import fetch from 'node-fetch';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export async function callGroq(messages, systemPrompt, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const body = {
    model: MODEL,
    max_tokens: options.maxTokens || 2048,
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  };

  const r = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Groq API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

const SYSTEM_PROMPT = `Tu es un assistant DevOps expert intégré à MyPresc Deploy.

PÉRIMÈTRE STRICT : Tu réponds UNIQUEMENT aux questions concernant :
Docker, Docker Compose, Kubernetes, k3s, microk8s, Linux, Nginx, SSL/TLS,
Let's Encrypt, Certbot, CI/CD, GitHub Actions, GitLab CI, Jenkins,
Ansible, Terraform, Prometheus, SSH, systemd, cron, sécurité serveur,
déploiement d'applications, bases de données (MySQL, PostgreSQL, Redis, SQLite, MongoDB),
Node.js, Python, PHP, Java, monitoring, logs, performance serveur.

Si la question est hors de ce périmètre, réponds avec : HORS_SUJET

RÈGLES DE RÉPONSE :
1. Toujours proposer des commandes exactes et copiables
2. Structurer la réponse en : Diagnostic → Commandes → Explication → Avertissements
3. Si un contexte VPS est fourni, personnalise ta réponse selon les outils détectés
4. Si des projets sont détectés sur le VPS, propose de les analyser ou d'y travailler
5. Signale clairement les commandes dangereuses avec ⚠️
6. Pour chaque commande, explique ce qu'elle fait et quand l'utiliser
7. Réponds en français si la question est en français, en anglais sinon

FORMAT DE RÉPONSE (JSON strict uniquement, aucun texte avant/après) :
{
  "answer": "explication complète en prose",
  "commands": [
    { "cmd": "commande exacte", "description": "ce que fait cette commande", "dangerous": false }
  ],
  "steps": ["étape 1", "étape 2"],
  "warnings": ["avertissement si applicable"],
  "suggested_projects": ["projet détecté sur le VPS à analyser"],
  "sources": ["docker.md", "linux-server.md"]
}`;

export async function askLLM(question, context, chunks, suggestedProjects = []) {
  const sourceFiles = [...new Set(chunks.map(c => c.source_file))];
  const knowledgeContext = chunks.map(c => `[${c.source_file}]\n${c.content}`).join('\n\n---\n\n');

  const userMessage = [
    context ? `${context}\n\n` : '',
    `Base de connaissance pertinente :\n${knowledgeContext}`,
    `\n\nQuestion de l'utilisateur : ${question}`,
    suggestedProjects.length > 0
      ? `\n\nProjets détectés sur le VPS que tu peux mentionner : ${suggestedProjects.join(', ')}`
      : '',
  ].join('');

  const text = await callGroq(
    [{ role: 'user', content: userMessage }],
    SYSTEM_PROMPT,
    { maxTokens: 2048 }
  );

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      parsed.sources = parsed.sources || sourceFiles;
      return parsed;
    }
  } catch {}

  return {
    answer: text,
    commands: [],
    steps: [],
    warnings: [],
    suggested_projects: suggestedProjects,
    sources: sourceFiles,
  };
}