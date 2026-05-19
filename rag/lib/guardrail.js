import { callGroq } from './llm.js';

const CLASSIFICATION_SYSTEM = `Tu es un classificateur. Réponds UNIQUEMENT par "DEVOPS" ou "OFF_TOPIC". Aucun autre texte.`;

const CLASSIFICATION_PROMPT = `Est-ce que cette question concerne : Docker, Kubernetes, Linux, Nginx, CI/CD, GitLab, Jenkins, Ansible, Terraform, Prometheus, SSH, SSL, déploiement, monitoring serveur, bases de données, sécurité serveur, Node.js, Python, PHP, Java, infrastructure cloud ?

Question : {question}

Réponds UNIQUEMENT avec un seul mot : DEVOPS ou OFF_TOPIC`;

const OFF_TOPIC_RESPONSE = {
  off_topic: true,
  message: "Je suis spécialisé en DevOps et infrastructure. Je ne peux pas répondre à cette question. Essaie de me demander quelque chose lié à Docker, Kubernetes, Nginx, CI/CD, Linux, ou la gestion de tes serveurs.",
  answer: '',
  commands: [],
  steps: [],
  sources: [],
};

export async function checkGuardrail(question) {
  try {
    const prompt = CLASSIFICATION_PROMPT.replace('{question}', question);
    const result = await callGroq([{ role: 'user', content: prompt }], CLASSIFICATION_SYSTEM, { maxTokens: 10 });
    const text = (result || '').trim().toUpperCase();
    if (text.includes('OFF_TOPIC')) return { pass: false, response: OFF_TOPIC_RESPONSE };
    return { pass: true };
  } catch {
    return { pass: true };
  }
}
