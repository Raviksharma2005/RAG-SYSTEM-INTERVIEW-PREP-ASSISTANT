# Data Sources — Smart Interview Prep Assistant

All content ingested into the vector database must be listed here with license verification **before** ingestion.

| Dataset/Source | License | Date Checked | Priority | Domain | Notes |
|---|---|---|---|---|---|
| Self-written DSA notes | Owned | 2026-06-20 | 1 (highest) | DSA | Primary content — original explanations of core DSA concepts |
| Self-written System Design notes | Owned | 2026-06-20 | 1 (highest) | System Design | Original system design topic explanations |
| Self-written Core CS notes | Owned | 2026-06-20 | 1 (highest) | OS, DBMS, CN | Original OS/DBMS/CN concept notes |
| Self-written HR notes | Owned | 2026-06-20 | 1 (highest) | HR | Curated HR interview Q&A based on common patterns |
| donnemartin/system-design-primer | MIT | 2026-06-20 | 2 | System Design | Attribution in README required; MIT allows commercial use |
| Common DSA patterns (LeetCode-style) | Public knowledge | 2026-06-20 | 2 | DSA | Standard algorithmic concepts (not copied from any specific copyrighted source) |

## Priority Rules

- **Priority 1**: Self-authored content. Always preferred when topics overlap.
- **Priority 2**: Verified open-source/public-domain content with proper attribution.
- **Priority 3**: Community content — only used when no P1/P2 source covers the topic.

## Conflict Resolution

When two sources cover the same topic:
1. The higher-priority chunk is kept in `chunks.jsonl`.
2. The lower-priority duplicate is logged in `data/duplicates_review.md`.
3. No silent ingestion of conflicting information.
