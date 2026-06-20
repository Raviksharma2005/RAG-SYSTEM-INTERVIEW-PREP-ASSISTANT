import json

lines_main = open(r'd:\RAG ASSISTANT\interview-rag\data\chunks.jsonl', 'r', encoding='utf-8').readlines()
lines_sdp = open(r'd:\RAG ASSISTANT\interview-rag\data\chunks_sdp.jsonl', 'r', encoding='utf-8').readlines()
all_lines = lines_main + lines_sdp

with open(r'd:\RAG ASSISTANT\interview-rag\data\chunks.jsonl', 'w', encoding='utf-8') as f:
    f.writelines(all_lines)

ids = set()
domains = {}
sources = {}
for l in all_lines:
    l = l.strip()
    if not l:
        continue
    d = json.loads(l)
    ids.add(d['id'])
    dom = d['metadata']['domain']
    src = d['metadata']['source']
    domains[dom] = domains.get(dom, 0) + 1
    sources[src] = sources.get(src, 0) + 1

print(f'Total unique chunks: {len(ids)}')
print(f'Total lines: {len([l for l in all_lines if l.strip()])}')
print('\nBy domain:')
for k, v in sorted(domains.items()):
    print(f'  {k}: {v}')
print('\nBy source:')
for k, v in sorted(sources.items()):
    print(f'  {k}: {v}')
