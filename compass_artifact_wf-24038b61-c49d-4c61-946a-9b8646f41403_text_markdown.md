# The 2026 AI model atlas: a collectively exhaustive survey

**The global AI model landscape in April 2026 spans 500+ distinct models across a dozen modalities, with Chinese open-weight releases now matching or exceeding Western proprietary frontier systems in most categories.** The gap that defined 2023 has essentially collapsed: DeepSeek V3.2, Qwen3-Max, Kimi K2 Thinking, and GLM-4.7 are now routinely benchmarked alongside GPT-5, Claude Opus 4.6, and Gemini 3.1 Pro. Meanwhile, modality silos have dissolved — native omni-modal systems (Gemini 3, GPT-5, Qwen3-Omni, MiniCPM-o) now handle text, vision, audio, and action in single architectures. Below is a category-by-category inventory. Licensing notation: **OS** = open-weight/open-source, **CS** = closed/proprietary. Country codes follow ISO conventions (🇺🇸 US, 🇨🇳 China, 🇫🇷 France, 🇬🇧 UK, 🇨🇦 Canada, 🇩🇪 Germany, 🇮🇱 Israel, 🇳🇴 Norway, 🇯🇵 Japan).

---

## 1. Large language models (text, chat, reasoning)

### US and Western flagships (closed-source frontier)

**OpenAI** (🇺🇸) operates the GPT and o-series families. GPT-4o (May 2024), GPT-4.1 and GPT-4.5/"Orion" (Feb 27, 2025), then the unified **GPT-5** (Aug 7, 2025) with gpt-5, gpt-5-mini, gpt-5-nano, and gpt-5-chat variants (400K–1M context). GPT-5.1, GPT-5.2 (Dec 2025, 400K context), GPT-5.3 Codex, and **GPT-5.4 Thinking** (March 2026) followed. The reasoning o-series includes o1, o1-mini, o1-pro, o3, o3-mini, o3-pro, and o4-mini. All closed-source. **gpt-oss-20B** and **gpt-oss-120B** are the Apache-2.0 open-weight siblings released in 2025.

**Anthropic** (🇺🇸) ships the Claude family: Claude 3.5 Sonnet/Haiku (2024), Claude 3.7 Sonnet (Feb 2025), Claude Sonnet 4 and Opus 4 (May 22, 2025), Sonnet 4.5 and Haiku 4.5 (Sep/Oct 2025), **Claude Opus 4.5** (Nov 24, 2025, 80.9% SWE-bench Verified), Opus 4.6 and Sonnet 4.6 (Feb 2026, adaptive thinking and 1M-token beta context), and **Claude Opus 4.7** (Apr 16, 2026). Claude "Mythos" is in internal testing. All closed.

**Google DeepMind** (🇺🇸/🇬🇧) delivers the Gemini family: Gemini 1.5 Pro/Flash (2024), Gemini 2.0 Flash/Pro (Dec 2024–Feb 2025), **Gemini 2.5 Pro/Flash/Flash-Lite** (GA June 17, 2025, 1M-token MoE with Deep Think mode), and **Gemini 3 Pro / 3.1 Pro / 3.1 Flash / 3.1 Flash-Lite** (late 2025–Q1 2026). Open-weight **Gemma 2** (9B/27B, 2024) and **Gemma 3** (1B/4B/12B/27B, 2025) round out the family. All Gemini closed; Gemma under custom Gemma license.

**Meta** (🇺🇸) moved to the **Llama 4 Herd** (April 5, 2025): **Scout** (17B active/109B total MoE, 10M context), **Maverick** (17B active/400B total, 1M context), and **Behemoth** (~288B active/~2T total, still training). Llama 3.1 (8B/70B/405B), 3.2 (1B/3B + 11B/90B Vision), and 3.3 (70B) remain in circulation. All under Llama Community License.

**xAI** (🇺🇸) released Grok 2, Grok 3 (Feb 2025), **Grok 4** (July 2025), **Grok 4.1** (Nov 17, 2025, hallucination rate cut to 4.22%), Grok 4.1 Fast (2M context), and **Grok 4.20 Beta 2** (March 2026). Grok 5 began training Sept 2025. Closed source; Grok-1 (314B) was open-sourced earlier.

**Mistral AI** (🇫🇷) spans proprietary (Mistral Large 2, Mistral Medium 3, **Mistral Small 4** from March 2026) and open-weight tiers (Mistral 7B, Mixtral 8x7B/8x22B, Mistral Nemo 12B, **Magistral** reasoning models, Ministral 3B/8B, and **Voxtral** audio LM). Apache 2.0 dominates the open releases.

### Other Western labs

**Cohere** (🇨🇦) — Command R, Command R+, Command R 08-2024, **Command A** (2025), plus the multilingual **Aya 23** and **Aya Expanse** (8B/32B) open-weight series. **AI21 Labs** (🇮🇱) ships Jamba 1.5 Mini/Large (hybrid Mamba-Transformer, Jamba Open Model License). **Databricks** (🇺🇸) released **DBRX** (132B MoE, Databricks Open License). **Aleph Alpha** (🇩🇪) offers Pharia-1-LLM-7B. **Allen Institute for AI** (🇺🇸) is the leading fully-open lab with **OLMo 2** (7B/13B/32B), **Tulu 3** (8B/70B/405B), and **Molmo** (detailed in the multimodal section); all Apache 2.0. **Reka AI** (🇺🇸/🇬🇧) — Reka Core, Flash, Edge. **Nous Research** (🇺🇸) — Hermes 3 405B, Hermes 4. **IBM** (🇺🇸) — Granite 3.0, 3.1, 3.2, 3.3 family (2B/8B, Apache 2.0). **NVIDIA** (🇺🇸) — **Llama-Nemotron** (Nano/Super/Ultra reasoning models) and **Nemotron-4 340B**. **Amazon** (🇺🇸) — **Nova Micro/Lite/Pro/Premier** and Titan Text. **Microsoft** (🇺🇸) — **Phi-3, Phi-3.5, Phi-4, Phi-4-mini, Phi-4-reasoning/reasoning-plus**, and the multimodal Phi-4 variants (all MIT). **Apple** (🇺🇸) — Apple Intelligence on-device and server foundation models, plus the research **Apple Ferret-UI 2** and **Manzano**. **Perplexity** (🇺🇸) — Sonar, Sonar Pro, Sonar Reasoning, and R1 1776 (an uncensored DeepSeek R1 fine-tune). **Snowflake** (🇺🇸) — Arctic (480B MoE). **Inflection** (🇺🇸) — Pi 3.0. **Writer** (🇺🇸) — Palmyra X 004/005. **Liquid AI** (🇺🇸) — LFM-1B/3B/40B non-transformer architectures. **SambaNova** (🇺🇸) and **Together AI** (🇺🇸) mostly host third-party weights.

### Chinese LLM ecosystem

**DeepSeek** (🇨🇳, all MIT-licensed OS) pioneered the 2025 open-reasoning wave. DeepSeek-V2 (236B MoE, May 2024), DeepSeek-V3 (671B MoE/37B active, Dec 2024), **DeepSeek-R1** (Jan 20, 2025, the "DeepSeek shock"), R1-Distill series (1.5B–70B, based on Qwen/Llama), R1-0528, **DeepSeek-V3.1** (Aug 2025, hybrid thinking), V3.1-Terminus, **V3.2-Exp** with Sparse Attention (Sep 2025), **DeepSeek-V3.2** stable (Dec 1, 2025, 163K context), V3.2-Speciale, and the math-specialist **DeepSeekMath-V2** (Nov 2025, IMO gold). **DeepSeek R2 remains unreleased as of April 2026**, reportedly delayed.

**Alibaba / Qwen** (🇨🇳, mostly Apache 2.0) operates the broadest open family. Qwen2 and **Qwen2.5** series (0.5B–72B), Qwen2.5-Max (Jan 2025, proprietary), **QwQ-32B-Preview** and **QvQ-72B** reasoning models (late 2024). The **Qwen3 family** (April 2025) covers dense 0.6B/1.7B/4B/8B/14B/32B and MoE **Qwen3-30B-A3B** and **Qwen3-235B-A22B**, all with toggleable thinking mode and 119-language support. Qwen3-2507 refreshes pushed to 1M context. **Qwen3-Coder** and Qwen3-Coder-Flash (July 2025) lead open-source coding. **Qwen3-MT** handles 92 translation languages. **Qwen3-Next-80B-A3B** (Sep 2025) cut costs ~10×. **Qwen3-Max** (Sep 2025, >1T params, proprietary) hit LMArena top 3; **Qwen3-Max-Thinking** (Dec 2025) hit 100% on AIME25. **Qwen3.6 / Qwen3.5 Max** serve as the current Alibaba Cloud flagships.

**Moonshot AI / Kimi** (🇨🇳) — Kimi v1 (2023, first 128K Chinese model), Kimi K1.5 (early 2025), **Kimi K2** (1T/32B active MoE, July 2025, Modified MIT), Kimi-K2-Instruct-0905, **Kimi K2 Thinking** (Nov 6, 2025, trains for ~$4.6M, chains 200–300 tool calls), and **Kimi K2.5 / K2.5-Lightning** (Jan 2026, multimodal with MoonViT encoder).

**Zhipu AI / Z.ai** (🇨🇳, MIT) — ChatGLM lineage through GLM-4, GLM-4-Plus/Air/Flash, GLM-Z1 reasoning preview, **GLM-4.5** (July 2025), GLM-4.5-Air, **GLM-4.5V** (106B vision), **GLM-4.6** (355B MoE, trained on Cambricon domestic chips), **GLM-4.6V** (Dec 2025), GLM-4.6V-Flash, and **GLM-4.7** (Dec 22, 2025, #1 on WebDev Arena). The mysterious "Pony Alpha" on OpenRouter in Feb 2026 is widely suspected to be GLM-5 (~745B/44B active on Huawei Ascend).

**Baidu** (🇨🇳) — ERNIE 4.0/4.0 Turbo, and **ERNIE 4.5** family open-sourced June 30, 2025 under Apache 2.0 (10 variants up to 424B/47B active MoE). **ERNIE X1** reasoning (March 2025), ERNIE-4.5-VL-28B-A3B-Thinking, plus free consumer ERNIE Bot.

**Tencent** (🇨🇳) — Hunyuan-Large (389B MoE, Nov 2024), Hunyuan-Turbo/TurboS (first hybrid-Transformer-Mamba MoE at scale), **Hunyuan-T1** (March 2025 reasoning), T1-Vis multimodal, **Hunyuan-A13B** open MoE (June 2025), and flagship **Hunyuan 2.0** (Dec 5, 2025, 406B MoE/32B active).

**ByteDance / Seed** (🇨🇳, mostly closed via Volcengine) — Doubao-1.5-Pro (sparse MoE, Jan 2025), Doubao-1.5-vision-pro, Doubao-1.5-realtime-voice-pro, **Doubao-1.5-thinking-vision-pro (Seed1.5-VL)**, Seed Diffusion Preview (2,146 tok/s diffusion code LM), **Seed1.8 / Doubao 1.8** (Dec 2025), **Doubao-Seed-Code** (Dec 2025, SOTA SWE-Bench), **Seed Prover 1.5** math model, and Doubao-Seed-2.0.

**MiniMax** (🇨🇳, MIT) — Abab6/6.5, **MiniMax-01** and MiniMax-Text-01 (456B/45.9B active, Lightning Attention), **MiniMax-M1** reasoning (June 2025), **MiniMax-M2** (230B/10B active, Oct 2025), M2.1 polyglot coding, M2.5/M2.5-Lightning, and M2.7 (March 2026).

**01.AI** (🇨🇳, Apache 2.0) — Yi-34B, Yi-1.5 (6B/9B/34B), Yi-VL, Yi-Coder, Yi-Large, **Yi-Lightning** (Oct 2024, LMSYS top tier); 01.AI halted new foundation pretraining in March 2025.

**Baichuan AI** (🇨🇳) — Baichuan2, Baichuan-3/4, **Baichuan-M1** medical reasoning (Jan 2025, 20T-token training), Futang pediatric LLM, **Baichuan-M2** (32B open, Aug 2025), and M2 Plus evidence-augmented clinical model.

**SenseTime** (🇨🇳, closed) — SenseNova 5.0/5.5, **SenseNova V6** and V6 Reasoner (April 2025), V6.5, SenseNova 6.0 edge-side variant, plus Wuneng embodied and KaiWu world-model platforms.

**iFlytek** (🇨🇳) — Spark/Xinghuo V3.5, V4.0, 4.0 Turbo, **Spark X1** (Jan 2025, first LLM trained wholly on Huawei 910B chips), Spark X1 Upgrade (April 2025), and Spark Medical X1.

**Huawei** (🇨🇳) — Pangu 3.0, 5.0, and **Pangu 5.5** (718B MoE/256 experts, June 2025). Open releases include openPangu 7B dense, openPangu Pro MoE 72B, and openPangu-Embedded-1B on Ascend.

**StepFun / 阶跃星辰** (🇨🇳) — Step-1, Step-2, **Step-3** (321B VLM MoE, July 2025), Step-3.5-Flash (Feb 2026, Apache 2.0), plus the audio-focused Step-Audio 2, **Step-Audio-R1**, Step-Audio-R1.1 Realtime, Step-Audio-EditX, and the math-formalization StepFun-Formalizer (8B/33B).

**Xiaomi** — **MiMo** and MiMo-V2-Flash (309B MoE/15B active, Dec 2025).

**Ant Group** (🇨🇳) — **Ling-2.5-1T** agent-native foundation model and **Ring-2.5-1T** (world's first hybrid-linear thinking model, IMO 2025 gold-equivalent, Feb 2026), plus the omni **Ming-Flash-Omni-2.0**.

**InternLM / Shanghai AI Lab** — InternLM2, InternLM2.5, **InternLM3-8B-Instruct** (dual-mode, trained on only 4T tokens), InternThinker, InternLM-Math, **Intern-S1** and Intern-S1-Pro scientific multimodal.

**XVERSE** — XVERSE-13B/65B, XVERSE-MoE-A4.2B, XVERSE-Long-256K, XVERSE-Ent-A4.2B entertainment-vertical MoE (Dec 2025).

Other notable labs include **Skywork** (Kunlun), **Qihoo 360** Zhinao, **Inspur Yuan 2.0**, **Tsinghua KEG** (now folded into Z.ai), and **JD ChatRhino**.

---

## 2. Image generation models

The **arena leaderboard is led by OpenAI's GPT Image 1.5** (~1264 Elo, April 2026) with Google's **Nano Banana Pro / Gemini 3 Pro Image** (Nov 2025, 4K output, SynthID watermarking) and **Nano Banana 2 / Gemini 3.1 Flash Image** close behind. **Midjourney V7** (April 2025, V8 Alpha in March 2026) still leads artistic aesthetic; **FLUX.2** from Black Forest Labs (🇩🇪, Nov 2025) leads open-weight models with five variants including the Apache-2.0 FLUX.2 [klein] 4B/9B and the 32B FLUX.2 [dev]. **Ideogram 3.0** (🇨🇦, March 2025) dominates typography; **Reve Image** (🇺🇸, March 2025) leads prompt adherence; **Adobe Firefly Image Model 5** (Oct 2025) remains the commercially-safe choice with licensed training data. **Recraft V4** owns vector/logo design.

**Chinese image models** now occupy much of the top tier: **ByteDance Seedream 4.0/4.5/5.0** (2K in 1.8s, MoE), **Alibaba Qwen-Image / Qwen-Image-2512 / Qwen-Image-Layered** (20B MMDiT, Apache 2.0, industry-best Chinese text rendering), **Tencent HunyuanImage 3.0** (80B/13B active MoE, Sep 2025 — largest open-source image model), **Kuaishou Kolors** and Kling image, **Baidu ERNIE-ViLG**, and **ByteDance Jimeng**. Additional notable models: **Stable Diffusion 3.5** (Stability, UK/US), **Playground v3**, **Leonardo Phoenix**, **DeepSeek Janus-Pro** (unified understanding+generation), **PixArt-Σ**, **NVIDIA SANA**, **Meta Imagine/Emu/CM3Leon**, and **xAI Aurora** (the Grok image model).

---

## 3. Video generation models

**Runway Gen-4.5** (Dec 2025, 1247 Elo) currently tops the Artificial Analysis text-to-video leaderboard, narrowly ahead of **OpenAI Sora 2 / Sora 2 Pro** (Sep 30, 2025, synchronized dialogue and sound, Disney character cameos — though OpenAI announced March 24, 2026 that the Sora app shuts down April 26, 2026 with the API following in September). **Google Veo 3.1 / 3.1 Fast / 3.1 Lite** (Jan 2026, 4K with Ingredients-to-Video reference handling) is deeply integrated across Gemini, YouTube Shorts, Flow, and Vertex AI.

**Chinese video models dominate the mid-tier and open-source bench.** **Kuaishou Kling 3.0 / 2.6 / 2.5 Turbo** offers 2-minute 1080p/30fps output and simultaneous audio-visual generation. **ByteDance Seedance 2.0 / 1.5 Pro** handles multilingual lip-sync and multi-shot storytelling. **MiniMax Hailuo 2.3 / Hailuo 02** (Oct 2025, NCR architecture, 1080p). **Alibaba Wan 2.2 / 2.5 / 2.6 / 2.7** is the leading open-source video family (Apache 2.0, VBench 84.7%, Thinking Mode in 2.7). **Tencent HunyuanVideo 1.5** (Nov 2025, 8.3B params, runs on RTX 4090). **ShengShu Vidu Q2/Q3** emphasizes micro-expressions.

Other notable entries: **Luma Ray3 / Ray3.14** (16-bit HDR, 1080p, reasoning video), **Pika 2.5** (Pikaswaps, Pikaframes, Pikaffects), **Lightricks LTX-2** (Jan 2026, 19B params including 5B audio, 4K/50fps, Apache 2.0), **Grok Imagine Video** (xAI, Aurora engine), **Meta Movie Gen** (announced, limited release), **Adobe Firefly Video**, plus avatar/talking-head specialists **Synthesia**, **Hedra**, and **D-ID**.

---

## 4. Vision models (understanding, detection, segmentation)

**Meta's DINOv3** (Aug 2025) — a 1.7B self-supervised ViT-7B trained on 1.7B images — is the current foundation encoder, with ConvNeXt variants and a novel "Gram anchoring" technique. **Meta SAM 3** (Nov 20, 2025) introduced Promptable Concept Segmentation via text prompts; **SAM 3.1** and **SAM 3D** followed, deployed in Facebook Marketplace's "View in Room" and Instagram Edits. **Google PaliGemma 2** (Dec 2024, SigLIP-So400m + Gemma 2 across 2B/9B/27B × 224/448/896 resolutions) and **SigLIP 2** (Feb 2025) anchor Google's vision encoders. **Apple AIMv2** (CVPR 2025) provides 19 vision-encoder variants. **Microsoft Florence 2** remains widely used.

Object detection: **YOLOv12** (Feb 2025, attention-centric, FlashAttention-based) and **YOLOv12-turbo** (March 2025); **Ultralytics YOLO26** (late 2025, NMS-free unified detection/segmentation/pose); **RT-DETRv3** (R101: 54.6% AP) and **RT-DETRv4** (Nov 2025, leverages vision foundation models); **Grounding DINO 1.5 Pro/Edge** for open-vocabulary detection. **OpenAI CLIP** and the Chinese **InternVL/CogVLM/Qwen-VL** encoders remain important.

---

## 5. Multimodal models (vision-language and beyond)

**Frontier proprietary systems** are now natively omni-modal: GPT-5 (unified router over text/image/audio/video), Gemini 2.5 Pro and Gemini 3.1 Pro, Claude Opus 4.5/4.6/4.7 (vision + Infinite Chats context), Grok 4 / 4.1 (multimodal with video roadmap), and Mistral's **Pixtral Large** (124B, Nov 2024, leads MathVista at 69.4%).

**Open-weight multimodal champions**:
- **Meta Llama 4 Scout/Maverick/Behemoth** — first natively multimodal Llama with early-fusion text+vision.
- **Meta Llama 3.2 Vision** (11B/90B) — late-fusion cross-attention.
- **Alibaba Qwen3-VL** family (Sep–Oct 2025, 2B/4B/8B/32B dense plus 30B-A3B and 235B-A22B MoE; Instruct + Thinking variants; 256K context); Qwen2.5-VL remains widely used; **Qwen2.5-Omni** is end-to-end text/image/audio/video.
- **OpenGVLab InternVL3** (April 2025) and **InternVL 3.5** (Aug 2025, 241B-A28B claims open-source SOTA approaching GPT-5).
- **DeepSeek-VL2** and **Janus-Pro** (unified understanding/generation, 1B/7B).
- **Microsoft Phi-4-multimodal** (5.6B, text+vision+audio mixture-of-LoRAs) and **Phi-4-reasoning-vision-15B** (March 2026).
- **Ai2 Molmo** (72B, 7B-D/O, MolmoE-1B) and **Molmo 2** (Dec 2025, built on Qwen 3 / Olmo, with video pointing and multi-frame reasoning).
- **OpenBMB MiniCPM-V 2.6 / MiniCPM-o 2.6 / MiniCPM-V 4.0 / MiniCPM-o 4.5** — compact omnimodal champions.
- **Zhipu GLM-4V-9B / GLM-4.1V-Thinking / GLM-4.5V / GLM-4.6V**.
- **HuggingFace Idefics3-8B-Llama3**.
- **LLaVA-OneVision**, **LLaVA-Video**, **LLaVA-OneVision-1.5**.
- **NVIDIA NVLM-D-72B**.
- **ByteDance Tarsier / Tarsier2-7B** (video description SOTA).
- **Baichuan-Omni-1.5** and **Kimi-Audio** extend the Chinese omni-modal wave.

---

## 6. Audio and speech models

### Text-to-speech
Arena leaders: **Inworld TTS-1.5 Max** (~1236 Elo), **Google Gemini 3.1 Flash TTS** (1211), **ElevenLabs Eleven v3** (1179, with Eleven v3 Conversational in Feb 2026). Other commercial: ElevenLabs Multilingual v2, Flash v2.5, Turbo v2.5; OpenAI **gpt-4o-mini-tts** and **gpt-realtime**; Google Cloud TTS with Chirp 3 HD, NotebookLM voices, and Lyria RealTime; Microsoft Azure Neural TTS and research VALL-E 2 / VibeVoice; Amazon Polly Neural/Generative and Nova Sonic; **Cartesia Sonic-3** (40–90ms TTFA); Hume Octave 2; PlayHT PlayDialog; Speechify 2.8 HD; Resemble AI; Rime; Murf.

Open-source TTS: **Kokoro 82M v1.0** (Apache 2.0), **Sesame CSM-1B**, **Orpheus TTS**, **Dia 1.6B** (Nari Labs), **F5-TTS v1**, StyleTTS 2, XTTS-v2, Piper, Zonos, MaskGCT, Llasa-3B, Higgs Audio V2, **Kyutai TTS 1.6B** and **Kyutai Pocket TTS 100M** (🇫🇷), Mistral **Voxtral TTS**, and the Magpie-Multilingual 357M.

Chinese TTS: **MiniMax Speech-02-HD / Speech 2.6 HD/Turbo**, **Alibaba CosyVoice 1.0/2.0 / Fun-CosyVoice 3.0** (9 languages + 18 Chinese dialects), **ByteDance MegaTTS3** and Seed-TTS, **iFlytek Spark TTS**, **Fish Audio OpenAudio S1** (top open-weight on TTS Arena at 1165 Elo), **Bilibili IndexTTS2**, **StepFun Step-Audio 2 / EditX**, **Xiaohongshu FireRedTTS**, **Zhipu GLM-TTS**, **Baichuan-Audio**, and **Moonshot Kimi-Audio**.

### Speech-to-text
Proprietary: **OpenAI gpt-4o-transcribe / gpt-4o-mini-transcribe** (March 2025, beats Whisper v3), **Whisper large-v3-turbo** (MIT OS); **Google Chirp 3**; **AssemblyAI Universal-3 / Universal-3 Pro**; **Deepgram Nova-3** (5.26% WER) and **Deepgram Flux** for voice agents; **Speechmatics Ursa 2** (🇬🇧); **ElevenLabs Scribe v2 / v2 Realtime** (Jan 2026, 93.5% FLEURS, 150ms); **Gladia Solaria** (🇫🇷); AWS Transcribe; Azure Speech.

Open-source ASR: **NVIDIA Parakeet-TDT-0.6B v2/v3** (top HF Open ASR, 6.05% WER), **Parakeet RNNT/CTC 1.1B**, **Canary-1B-v2** and **Canary-Qwen-2.5B** (record 5.63% WER); **Meta SeamlessM4T v2** and **MMS** (1000+ languages); **Mistral Voxtral**; **Kyutai STT** and **Moshi STT**; **Alibaba FunASR / SenseVoice**; **iFlytek Spark ASR**; **Moonshot Kimi-Audio ASR**.

### Music generation
**Suno v5 / v5.5** (44.1kHz, cloned vocals, Suno Studio DAW, March 2026), **Udio v1.5 / Allegro**, **Google Lyria 3 / Lyria 3 Pro / Lyria RealTime** (Feb 2026 in Gemini app), **Stability Stable Audio 2 / Open**, **ElevenLabs Music API** (Aug 2025, label-licensed), **Riffusion**. Open-source: **Meta MusicGen / AudioGen / AudioCraft / EnCodec**, **YuE**, **DiffRhythm**, **ACE-Step v1.5** (China/US collaboration). Chinese commercial: **ByteDance Seed-Music / Haimian**, **Tencent SongGeneration / LeVo** (open), **Mureka-O1**.

### Conversational voice agents (end-to-end speech-to-speech)
**OpenAI gpt-realtime** and Advanced Voice Mode; **Google Gemini Live API** and NotebookLM Audio Overviews; **Sesame Maya/Miles** (on CSM-1B backbone); **Kyutai Moshi / Moshika / MoshiVis / Hibiki / Unmute** (🇫🇷 open stack); Character.ai Voice; Inworld; **Ultravox**; **StepFun Step-Audio-AQAA**; **Moonshot Kimi-Audio**; **Baichuan-Omni-1.5**; **Alibaba Qwen2.5-Omni**; **MiniMax Realtime**; **ElevenLabs Agents**; **Amazon Nova Sonic**.

---

## 7. Code generation models

**Frontier coding systems**: Claude Opus 4.5/4.6 (80.9% SWE-bench Verified), GPT-5.3 Codex and GPT-5.4, Gemini 3.1 Pro with Code Assist, and the agentic **Cognition Devin**. Cursor's **Composer**, Windsurf/Codeium models, **GitHub Copilot** ensembles, **Amazon Q Developer** (formerly CodeWhisperer), **Tabnine**, **Replit Code**, **Phind CodeLlama**, and **aiXcoder** fill the productized tier.

**Open-weight coding leaders**: **Qwen3-Coder / Qwen3-Coder-Flash / Qwen3-Coder-Next** (256K+ context, 100+ languages, Apache 2.0); **Qwen2.5-Coder 32B** (88.4% HumanEval); **DeepSeek-Coder V2 / V3** and DeepSeek-V3.2 in coding mode; **Mistral Codestral 25.01**, **Codestral Mamba**, and **Devstral** (agentic); **Meta Code Llama** (7B/13B/34B/70B, legacy); **BigCode StarCoder2** (Stability-backed); **Yi-Coder** (1.5B/9B, 52 languages); **Zhipu CodeGeeX 4 / GLM-4.5-Air-Code / GLM-4.6** coding variants; **Kimi-Dev** (Moonshot); **IBM Granite Code** (3B/8B/20B/34B, Apache 2.0); **NVIDIA Nemotron coding variants**; **ByteDance Doubao-Seed-Code** (Dec 2025, SOTA SWE-Bench); **MiniMax M2 / M2.1** polyglot; **WizardCoder**; **Salesforce CodeGen2**.

---

## 8. Embedding and reranker models

**Top of the April 2026 MTEB leaderboard**: **Google gemini-embedding-001** (68.32 avg; multimodal variants embed text/images/video/audio/PDFs into a shared 3,072-dim space), **Cohere Embed v4** (🇨🇦, 66.3 MTEB, 128K context — the longest available, with native binary quantization), **Voyage AI voyage-3-large / voyage-3.5 / voyage-4 family** (🇺🇸, including voyage-code-3, voyage-finance, voyage-law), **OpenAI text-embedding-3-large / 3-small** (64.6 / 62.3).

**Open-weight leaders**: **Alibaba Qwen3-Embedding-8B** (70.58 multilingual MTEB, plus 4B/0.6B variants, Apache 2.0) and **Qwen3-VL-Embedding** multimodal (2B/8B); **BAAI BGE-M3**, **bge-en-icl** (71.24 MTEB), and BGE-large/small; **NVIDIA NV-Embed-v2** (72.31 MTEB); **Microsoft E5 / multilingual-e5 / Harrier-OSS-v1**; **Jina Embeddings v3 / v4 / v5-text-small** (Germany-based); **Nomic Embed** and Nomic Embed Vision; **Snowflake Arctic Embed 2.0**; **Stella**; **Salesforce SFR-Embedding-2 / Mistral**; **Linq-Embed**; **mxbai-embed-large** (Mixedbread); **ColBERT v2** and **ColPali** (multimodal retrieval on document images); **Amazon Titan Embed v2**; **IBM Slate**; **Mistral mistral-embed**.

**Rerankers**: Cohere Rerank 3.5, Voyage rerank-2 and rerank-2-lite, BGE Reranker v2-m3, Jina Reranker v2, and Salesforce SFR-Rerank.

---

## 9. Robotics and embodied AI

**Vision-Language-Action (VLA) frontier**: Google DeepMind's **Gemini Robotics** family evolved through Gemini Robotics-ER, On-Device, and **Gemini Robotics 1.5 / ER 1.5** (Sep 25, 2025, multi-embodiment with Motion Transfer). **Physical Intelligence (Pi)** (🇺🇸) released **π₀** (flow-matching, open via openpi), **π₀-FAST**, **π₀.₅** (open-world generalization, Apr 2025), and **π*0.6** (experience-based RL, Nov 2025). **Figure AI Helix** and Helix 02 power the Figure 02/03 humanoids. **NVIDIA Isaac GR00T N1 / N1.5 / N1.7** (2.2B open VLA, Apache-2.0 ecosystem), plus **NVIDIA Cosmos Predict2.5 / Reason2 / Policy** world foundation models.

**Hardware-first labs**: Tesla **Optimus Gen 2/3**; Boston Dynamics **Atlas** (now integrated with Gemini Robotics); Agility **Digit**; **Apptronik Apollo** ($5B valuation, DeepMind-partnered); 1X **NEO / NEO Gamma / Redwood world model** (🇳🇴); Sanctuary AI **Phoenix / Carbon** (🇨🇦); **Skild Brain**; **Covariant RFM-1** (now Amazon).

**Chinese robotics**: **Unitree G1/H1/R1** (R1 launched July 2025 at $5,900); **UBTech Walker S1**; **AgiBot GO-1** (Zhiyuan); **BAAI RoboBrain 1.0/2.0**; **X-Humanoid XR-1** (Dec 2025, first to meet China's national embodied-AI standard, open-source with RoboMIND 2.0 dataset); Galbot, Engine AI, **Fourier GR-3**, **XPeng Iron**; **ByteDance GR-RL / RynnVLA-002**.

**Open academic VLAs**: **Octo** (Open-X), **OpenVLA** and **OpenVLA-OFT** (Stanford/Berkeley, MIT), **RDT-1B** (Tsinghua bimanual diffusion), **DexVLA**, **Diffusion-VLA**, **HybridVLA**, **CogACT**, **TinyVLA**, **HuggingFace SmolVLA 450M** and the LeRobot framework, **ACT (Action Chunking Transformers)**, Columbia/MIT **Diffusion Policy** and **3D Diffusion Policy**, Ai2 **MolmoAct**, **NORA / NORA-1.5**, **BitVLA** (1-bit), and **LAPA** (latent action pretraining).

**World models**: DeepMind **Genie 1/2/3** (Genie 3 offers 720p/24fps real-time worlds with minutes of coherence), Meta **V-JEPA / V-JEPA 2**, Decart+Etched **Oasis** (Minecraft), Google **GameNGen**, Microsoft **Muse**, Wayve **GAIA-1/2** (driving), **World Labs Marble** (single-image 3D scenes), and MBZUAI's **PAN**.

---

## 10. 3D generation, scientific, and niche categories

### 3D generation
**Tencent Hunyuan3D 1.0/2.0/2.1/2.5/3.0/3.1/3.5** leads the open-source 3D field, with 2.1 being the first fully-open production PBR model and **HunyuanWorld-1.0** (July 2025) the first open simulation-capable 3D world generator. **Microsoft TRELLIS** and **TRELLIS 2** (MIT) set the bar for structured-latent generation. **Stability SPAR3D** and **SV3D**, **OpenAI Shap-E / Point-E**, **NVIDIA Edify 3D**, **Luma Genie** and Dream Machine 3D, **Tripo / TripoSR / Tripo 2.0 / TripoSG** (China-linked), **Rodin Gen-1/Gen-2** (Hyper3D), **Meshy v3–v5**, **Alibaba Step1X-3D / Direct3D-S2**, **TencentARC InstantMesh**, **Kaedim**, **CSM Cube**, and academic **DreamGaussian / LGM / LRM / CraftsMan3D / Michelangelo / Clay** complete the field.

### Biology and chemistry
**AlphaFold 3** (DeepMind + Isomorphic, 2024 Nobel-recognized) predicts nucleic-acid and ligand complexes; **AlphaProteo**, **AlphaMissense**, and **AlphaGenome** (June 2025, 1Mb-context DNA variant effects) extend the family. **Meta ESM-2 / ESM-3** (EvolutionaryScale); **RoseTTAFold2** and **RoseTTAFold All-Atom** (Baker Lab); **Chai-1**; **MIT Boltz-1, Boltz-2, BoltzGen, BoltzDesign1** (all MIT-licensed); **Baidu HelixFold-3**; **ByteDance Protenix**; **OpenFold3**; **Pearl** (Genesis Molecular AI); **RFdiffusion / RFdiffusion2 / RFdiffusion3 / RFantibody** and **ProteinMPNN / LigandMPNN** (Baker Lab); **BindCraft**.

**Arc Institute**: **Evo** (Nov 2024, prokaryotic DNA foundation model) and **Evo 2** (40B params, 1Mb context, 9.3T nucleotides, Feb 2025 release, Nature March 2026) plus the cellular models **State**, **Stack**, and the agent **scBaseCount**.

**Materials/chemistry**: **Microsoft MatterGen** (Nature Jan 2025) and **MatterSim**; **NVIDIA BioNeMo / MolMIM**; Microsoft **AI2BMD**; Orbital Materials.

### Medicine
Google **Med-PaLM 2**, **MedLM**, **Med-Gemini-2D/3D/Polygenic**, **AMIE** (diagnostic dialogue), **Tx-LLM**, **PH-LLM / LSM** wearable models; academic **Merlin**, **CheXagent**, **LLaVA-Med**; plus Chinese **Baichuan-M1/M2 Plus** and Futang pediatric LLM.

### Math and reasoning
**DeepMind AlphaProof** (RL + Lean, Nature Nov 2025), **AlphaGeometry 2**, **Gemini Deep Think** (IMO 2025 gold, July 2025), **AlphaEvolve** (algorithm discovery), plus open weights from **DeepSeekMath-V2**, **Qwen2.5-Math**, **Numina NuminaMath**, and **StepFun-Formalizer**.

### Weather and climate
**DeepMind GraphCast, GenCast, NeuralGCM**; **Huawei Pangu-Weather**; **NVIDIA FourCastNet / FourCastNetv2 / Earth-2 stack (CorrDiff, StormCast)**; **Microsoft Aurora / ClimaX**; **Shanghai AI Lab FengWu**; **Fudan FuXi**; **IBM+NASA Prithvi-WxC**; **ECMWF AIFS** (operational Feb 25, 2025); **Environment Canada GEML**; **Google MetNet-3**; **OneForecast**; **XiHe / AI-GOMS** ocean models.

### Time-series and tabular
**Amazon Chronos / Chronos-Bolt / Chronos-2** (multivariate, Oct 2025); **Google TimesFM 1.0/2.0/2.5**; **Salesforce Moirai 1.0 / Moirai-MoE / Moirai 2.0**; **ServiceNow Lag-Llama**; **Nixtla TimeGPT**; **Datadog TOTO**; **Alibaba YingLong**; **Tsinghua Timer-XL**; **Kairos**. Tabular: **Prior Labs TabPFN v2** (Nature Jan 2025) and **TabPFN-2.5** (Nov 2025, 50K samples), **TabICL**, **CARTE**, **TabDPT**.

### Search and deep-research agents
**Perplexity Sonar / Deep Research**, **OpenAI Deep Research** (o3-based), **Gemini Deep Research**, **xAI Grok DeepSearch**, **Anthropic Claude Research**, plus **Glean**, **Exa**, **You.com Research**.

### Autonomous driving world models
**Wayve GAIA-2** and **LINGO-2** (🇬🇧); **Waymo EMMA**; **Tesla FSD V12/V13**; **Comma.ai Openpilot**; **NVIDIA DriveVLM**.

---

## Six structural observations about the 2026 landscape

**The open-source/closed-source distinction has become regional.** China's ecosystem is now overwhelmingly open-weight (DeepSeek, Qwen, GLM, Kimi, MiniMax, Hunyuan all ship MIT or Apache 2.0 weights), while US frontier labs — OpenAI, Anthropic, Google, xAI — remain closed at the top tier. Meta, Mistral, Allen AI, IBM, NVIDIA, and Microsoft form the Western open-weight counterweight.

**Reasoning went from novelty to default.** Every major lab now ships "thinking" modes: o-series at OpenAI, extended thinking in Claude, Deep Think in Gemini, Qwen3 thinking variants, DeepSeek R1/V3.2, GLM-Z1, MiniMax-M1, Kimi K2 Thinking, Hunyuan T1, Ring-2.5-1T. Test-time compute scaling is now a standard axis alongside parameter count.

**Modality fusion accelerated.** Natively omni-modal systems (Gemini 3, GPT-5, Qwen3-Omni, MiniCPM-o 4.5, Step-Audio-R1, Baichuan-Omni-1.5) are replacing single-modality stacks. Google's gemini-embedding-001 embeds text, images, video, audio, and PDFs in one shared vector space.

**Chinese hardware independence is visible in model releases.** GLM-4.6 trained on Cambricon chips; iFlytek Spark X1 and openPangu on Huawei Ascend; the rumored GLM-5 "Pony Alpha" reportedly trained entirely on Ascend + MindSpore. DeepSeek R2's reported delay is attributed to Ascend training difficulties.

**Video and audio are the new frontiers.** Sora 2, Veo 3.1, Runway Gen-4.5, Kling 3.0, Seedance 2.0, and LTX-2 now generate synchronized-audio 4K video; Suno v5.5, Lyria 3, and ElevenLabs Music have reached studio quality under label licensing deals.

**Scientific AI is producing Nobel-caliber results with increasing openness.** AlphaFold 3's 2024 Nobel, AlphaProof's Nature publication, Evo 2's Nature paper, MatterGen's Nature release, and MIT's Boltz/BoltzGen line — most shipped with open weights — mark the maturation of domain-specific foundation models. The next axis of competition will be agentic, embodied, and world-model systems that combine all these capabilities into systems that act in the world, not merely describe it.