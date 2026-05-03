# AI Evolution Tree — Model Page System

This document defines the standardized UI/UX structure for all model pages across AI Evolution Tree.

The goal is to:
- Reduce cognitive load
- Enable fast decision-making
- Support all model types (LLM, image, video, audio, etc.)
- Maintain consistency with flexibility

---

# 🧠 Core Principle

Model pages are NOT documentation.

They are **decision interfaces**.

Each page must answer within 5 seconds:

1. What is this model?
2. What is it best at?
3. How good is it?
4. Should I use it?

---

# 🧩 Page Layout Overview

Top → Bottom structure:

1. Hero Summary
2. Primary Experience (varies by modality)
3. Capability / Performance
4. Human Explanation
5. Use Cases
6. Comparison
7. Lineage
8. Details (collapsed)

Right Sidebar (sticky):
- Save / Compare
- Similar models
- Quick facts
- Sources

---

# 🟢 1. HERO SUMMARY (ALL MODELS)

## Purpose
Immediate clarity and positioning.

## Structure

- Model Name (H1)
- One-line description
- Primary CTA (Try / Compare)
- Key attributes (5 max)

## Example fields

- Best for
- Speed
- Cost
- Output type
- Developer
- Context (if applicable)

---

# 🎯 2. PRIMARY EXPERIENCE (BY MODEL TYPE)

## LLM (Claude, GPT, etc.)
→ Skip demo  
→ Go directly to capabilities

## Audio Models (Lyria, Suno)
→ Audio player (REQUIRED)

## Image Models
→ Image gallery (REQUIRED)

## Video Models
→ Video playback (REQUIRED)

## Rule

Always show **output first** if the model produces media.

---

# 📊 3. CAPABILITY / PERFORMANCE

## Replace raw benchmarks with:

Human-readable capability bars.

## Standard dimensions (LLM)

- Reasoning
- Coding
- Agentic Tasks
- Context / Memory
- Cost Efficiency

## Standard dimensions (Media)

- Quality
- Speed
- Control
- Consistency

## Rules

- Max 5 bars
- No benchmark names here
- Show score (0–10 or relative)

---

# 🧠 4. WHAT IT FEELS LIKE (CRITICAL)

## Purpose

Translate benchmarks into human insight.

## Format

Bullet points:

- strengths
- weaknesses
- subjective feel

## Example

- Extremely strong at complex reasoning  
- Feels like a senior engineer collaborator  
- Slower but more reliable  

---

# 🧩 5. USE CASES

## Structure

### Best for

- 3–5 bullets

### Not ideal for

- 3–5 bullets

## Rule

This section drives decision-making.

---

# ⚔️ 6. COMPARISON

## Format

Compare against 2–3 similar models.

## Dimensions

- Reasoning / Quality
- Speed
- Cost
- Key differentiator

## Output

Simple table or bar comparison.

---

# 🌳 7. LINEAGE (CORE FEATURE)

## Purpose

Show evolution and differentiation.

## Format

Parent → Current → Child

Optional:

Short insight:

- “Major shift: agent capability”
- “Scaling breakthrough”

---

# 📈 8. BENCHMARKS (MINIMAL)

## On main page

Show only 2–3 key signals:

- SWE-bench (coding)
- Intelligence rank (Artificial Analysis)
- Context / recall

## Rule

Hide full benchmarks behind:

→ "View all benchmarks"

---

# 🔍 9. DETAILS (COLLAPSIBLE)

All technical / dense info goes here.

## Sections

- Technical details
- Full benchmarks
- Pricing
- Safety
- Sources

## Rule

Collapsed by default.

---

# 📌 RIGHT SIDEBAR (STICKY)

## Components

### Save & Compare

- Save model
- Add to compare

### Similar Models

- 3–5 items

### Quick Facts

- Release date
- Developer
- Model type
- License

### Sources

- Official site
- Benchmark sources

---

# 🎨 VISUAL DESIGN RULES

## 1. Reduce visual noise

- Avoid excessive borders
- Use whitespace instead

## 2. Strong hierarchy

- H1 → Section → Body → Metadata

## 3. Different style per model type

| Type | Style |
|------|------|
| LLM | analytical / minimal |
| Audio | experiential |
| Image | gallery-driven |
| Video | cinematic |

## 4. Avoid "AI-generated feel"

- Break perfect symmetry
- Use varied spacing
- Limit icons

---

# 🧠 CONTENT RULES

## Always prioritize:

1. Meaning > metrics  
2. Use cases > specs  
3. Experience > architecture  

---

# ⚡ PERFORMANCE RULES

- Page must be scannable in <10 seconds
- Above-the-fold must answer key questions
- Avoid long text blocks

---

# 🔄 DYNAMIC RENDERING LOGIC

## Based on model type:

### LLM
- Show capabilities first
- Show coding + reasoning

### Audio
- Show audio player first

### Image
- Show gallery first

### Video
- Show video first

---

# 🏁 SUCCESS CRITERIA

A good model page should:

- Be understandable in 5 seconds
- Help users decide quickly
- Feel curated, not dumped
- Scale across all model types

