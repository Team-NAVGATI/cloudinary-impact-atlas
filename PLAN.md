# Impact Atlas v2: plan and status

Hackathon: CodeFibonacci x Cloudinary (PS-02). Judged on deep Cloudinary integration, innovation, good UI, usefulness (bonus: social good).

## 1. Positioning
Atlas is a **general evidence-intelligence tool**: put field photos and video in, get organised, searchable, provable evidence out, then report and alert. Domain logic lives in **playbooks**. **Chennai Flood-Watch** is the first playbook and the worked example of how the generic tool connects to a real case (live rainfall, river flow, a risk score, named officers).

## 2. Desk research
Reference sites analysed from `Website_ui_scraper/output`: Huly, Razorpay, Heidi Health, Allmorphic, FlowCV, Lab77.

| Site | Idea used |
| --- | --- |
| Heidi Health | Warm editorial palette, big display type, pill CTAs, AI prompt shown in the hero |
| Allmorphic | Real product moment in the hero, soft cards, one repeated conversion goal |
| Huly | Dense product tour, hairline borders, luminous dark sections |
| FlowCV | Calm app dashboard, warm neutrals, micro elevation, template-first onboarding |
| Razorpay | Structured product sections, explanatory tables, developer credibility |
| Archify (cloned) | Typed JSON to validated, explorable architecture and sequence diagrams |

Research and logic references (verified): Anthropic Contextual Retrieval (2024), Reciprocal Rank Fusion (SIGIR 2009), RAGAS (arXiv 2309.15217), NVIDIA NeMo Retriever multimodal embeddings, IMD rainfall classes.

**Personas:** field coordinator, municipal analyst or officer, reviewer or judge. **Jobs:** put media in without sorting; find a photo by describing it; show what changed; hand someone credible proof; tell the right person now. **First-run target:** under 90 seconds from landing to a sent report.

## 3. Status

| Area | Status |
| --- | --- |
| Design system (forest palette, light/dark toggle, contrast-checked) | Done. Light-mode status colours darkened after a WCAG audit found three pairs below 4.5:1 |
| Landing page (hero moment, problem, 5-step flow, bento, playbooks, logic, try-it, FAQ, CTA) | Done |
| Studio: one-screen upload with live 5-step pipeline, original vs Cloudinary delivery, streaming metadata | Done, verified in browser |
| Library: smart collections, evidence map, multi-select, needs-review | Done, verified |
| Ask: plan, hybrid retrieval (BM25 + meaning + look) fused by RRF, cited answer, claim check, trace | Done, verified against live data |
| Multimodal semantic index (NVIDIA Embed VL) | Done (in memory until migration 6 is applied) |
| Evidence reports for any selection; flood-risk reports for Chennai | Done |
| Workflow map with playbook layer; Playbooks page | Done, verified |
| Archify architecture and Ask sequence diagrams | Done; pass Archify showcase checks |
| Tutorial: first-run tour, checklist, public guide | Done |
| Story card (Cloudinary text overlays), email dispatch | Done (email needs a Resend key) |

## 4. Logic defects found by testing and fixed
1. Planner invented filters (site, phase, severity, weather) that hid the best evidence: filters now require support in the question text; ignored suggestions are shown.
2. Planner echoed the site list as keywords, ranking an irrelevant photo second: site names are removed from the prompt and site keywords are dropped unless the question names them.
3. "Grounded" badge passed an over-claiming answer: added a per-claim entailment check.
4. Before/after could pair photos from different places and imply a trend: pairs are now same-site, otherwise labelled a reference.
5. A dead model in the fallback chain could stall every request 60 s: models are health-tracked and skipped.
6. Cloudinary AI Vision burned about 2,800 tokens per photo: four prompts, about 1,300 per photo, with a quota guard.
7. Normal rivers were rated "minor water": rubric clarified for future analyses.

## 5. Known limits
* No separate reranker (rerank endpoints unavailable on the build account).
* Vectors are compared in the app (fine for thousands); pgvector `halfvec` + HNSW is the scale path.
* Videos are stored and get poster frames; frame analysis is not implemented.
* Demo contacts are placeholders on example.org.
