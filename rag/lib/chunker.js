import fs from 'fs';
import path from 'path';

const CHUNK_SIZE = 500;
const OVERLAP = 50;

function tokenize(text) {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

function chunkText(text, sourceFile) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + CHUNK_SIZE);
    const content = slice.join(' ');
    const keywords = [...new Set(tokenize(content))];
    chunks.push({
      id: `${sourceFile}::${i}`,
      source_file: sourceFile,
      content,
      keywords,
    });
    i += CHUNK_SIZE - OVERLAP;
  }
  return chunks;
}

export function loadKnowledgeBase(knowledgeBasePath) {
  const chunks = [];
  const files = fs.readdirSync(knowledgeBasePath).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const fullPath = path.join(knowledgeBasePath, file);
    const text = fs.readFileSync(fullPath, 'utf8');
    const fileChunks = chunkText(text, file);
    chunks.push(...fileChunks);
  }
  return chunks;
}
