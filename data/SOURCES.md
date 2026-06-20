# Data Sources — Smart Interview Prep Assistant

All content ingested into the vector database must be listed here with license verification **before** ingestion.

## Active Sources (Ingested)

| Dataset/Source | License | Date Checked | Priority | Domain | Notes |
|---|---|---|---|---|---|
| Self-written DSA notes | Owned | 2026-06-20 | 1 (highest) | DSA | Primary content — original explanations of core DSA concepts |
| Self-written System Design notes | Owned | 2026-06-20 | 1 (highest) | System Design | Original system design topic explanations |
| Self-written Core CS notes | Owned | 2026-06-20 | 1 (highest) | OS, DBMS, CN | Original OS/DBMS/CN concept notes |
| Self-written HR notes | Owned | 2026-06-20 | 1 (highest) | HR | Curated HR interview Q&A based on common patterns |
| donnemartin/system-design-primer | MIT | 2026-06-20 | 2 | System Design | GitHub repo verified MIT license. Content adapted and chunked with attribution. Covers: scalability, load balancing, caching, databases, CAP theorem, CDN, DNS, microservices, availability patterns, consistency patterns, system design interview approach |
| Common DSA patterns (public knowledge) | Public knowledge | 2026-06-20 | 2 | DSA | Standard algorithmic concepts — not copied from any specific copyrighted source |

## Excluded Sources (Verified and Rejected)

| Dataset/Source | License | Date Checked | Reason for Exclusion |
|---|---|---|---|
| ali-alkhars/interviews (HuggingFace) | **Unspecified** | 2026-06-20 | License not explicitly stated on dataset card. Contains only questions (no answers) for Angular/React/Vue/Java — not relevant to our domains (DSA, System Design, OS/DBMS/CN, HR). Per plan guidance: "Check card — Verify before ingest." Failed verification. |
| HR Interview Q&A (Kaggle — aroyankumar/hr-interview-questions) | CC0 | 2026-06-20 | 250K synthetically generated entries. Spot-checked 50 rows: quality inconsistent, many generic/templated responses. Decided to use self-authored HR content instead for higher quality and authenticity. |

## Priority Rules

- **Priority 1**: Self-authored content. Always preferred when topics overlap.
- **Priority 2**: Verified open-source/public-domain content with proper attribution.
- **Priority 3**: Community content — only used when no P1/P2 source covers the topic.

## Conflict Resolution

When two sources cover the same topic:
1. The higher-priority chunk is kept in `chunks.jsonl`.
2. The lower-priority duplicate is logged in `data/duplicates_review.md`.
3. No silent ingestion of conflicting information.

## Attribution

Content adapted from **donnemartin/system-design-primer** is used under the MIT License.
See: https://github.com/donnemartin/system-design-primer/blob/master/LICENSE.md
