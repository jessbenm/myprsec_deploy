import { searchIndex } from './embeddings.js';

export function retrieve(index, question, detectedTools = [], topK = 5) {
  const results = searchIndex(index, question, topK * 2);

  // Filter: if detected tools known, prefer chunks from relevant files
  const toolFileMap = {
    docker: ['docker.md', 'docker-compose.md'],
    'docker-compose': ['docker-compose.md'],
    kubectl: ['kubernetes.md'],
    k3s: ['kubernetes.md'],
    microk8s: ['kubernetes.md'],
    nginx: ['nginx.md'],
    'gitlab-runner': ['gitlab-ci.md'],
    ansible: ['ansible.md'],
    terraform: ['terraform.md'],
    prometheus: ['prometheus.md'],
    jenkins: ['jenkins.md'],
    node: ['nodejs-deployment.md'],
    python3: ['python-deployment.md'],
  };

  const relevantFiles = new Set();
  for (const tool of detectedTools) {
    const files = toolFileMap[tool] || [];
    files.forEach(f => relevantFiles.add(f));
  }

  let filtered = results;
  if (relevantFiles.size > 0) {
    const preferred = results.filter(r => relevantFiles.has(r.chunk.source_file));
    const rest = results.filter(r => !relevantFiles.has(r.chunk.source_file));
    filtered = [...preferred, ...rest];
  }

  return filtered.slice(0, topK).map(r => r.chunk);
}
