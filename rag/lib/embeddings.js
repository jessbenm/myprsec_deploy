import fs from 'fs';
import path from 'path';

// TF-IDF vectorization for cosine similarity (no external deps)

function buildVocabulary(chunks) {
  const vocab = new Set();
  for (const chunk of chunks) {
    for (const kw of chunk.keywords) vocab.add(kw);
  }
  return [...vocab];
}

function termFrequency(words, term) {
  const count = words.filter(w => w === term).length;
  return count / Math.max(words.length, 1);
}

function inverseDocumentFrequency(chunks, term) {
  const docsWithTerm = chunks.filter(c => c.keywords.includes(term)).length;
  if (!docsWithTerm) return 0;
  return Math.log(chunks.length / docsWithTerm);
}

function vectorize(text, vocab, idfMap) {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  return vocab.map(term => {
    const tf = termFrequency(words, term);
    const idf = idfMap[term] || 0;
    return tf * idf;
  });
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function buildIndex(chunks, indexPath) {
  const vocab = buildVocabulary(chunks);
  const idfMap = {};
  for (const term of vocab) {
    idfMap[term] = inverseDocumentFrequency(chunks, term);
  }

  const indexed = chunks.map(chunk => ({
    ...chunk,
    vector: vectorize(chunk.content, vocab, idfMap),
  }));

  const index = { vocab, idfMap, chunks: indexed };
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index));
  return index;
}

export function loadIndex(indexPath) {
  const raw = fs.readFileSync(indexPath, 'utf8');
  return JSON.parse(raw);
}

export function searchIndex(index, query, topK = 5) {
  const { vocab, idfMap, chunks } = index;
  const queryVec = vectorize(query, vocab, idfMap);

  const scored = chunks.map(chunk => ({
    chunk,
    score: cosineSimilarity(queryVec, chunk.vector),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > 0);
}
