# llama.cpp

Pure C/C++ inference engine for LLMs. Ships as a single binary (`llama-server`) with no Python dependency, supporting CPU, CUDA, Metal, Vulkan, SYCL, and more. Latest version supports continuous batching, speculative decoding, multimodal, structured output, and an OpenAI-compatible API.

## Quick start

```bash
# From HuggingFace
./llama-server -hf ggml-org/gemma-3-4b-it-GGUF:Q4_K_M -c 4096

# From local file
./llama-server -m models/ggml-model-Q4_K_M.gguf -c 4096 --host 0.0.0.0 --port 8080

# Test
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}'
```

## Server arguments

### Common parameters

#### Threading & CPU

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-t, --threads` | int | -1 (auto) | CPU threads for generation (env: `LLAMA_ARG_THREADS`) |
| `-tb, --threads-batch` | int | same as `--threads` | Threads for batch/prompt processing |
| `-C, --cpu-mask` | hex | "" | CPU affinity mask |
| `-Cr, --cpu-range` | lo-hi | — | CPU affinity range |
| `--cpu-strict` | 0\|1 | 0 | Strict CPU placement |
| `--prio` | int | 0 | Process/thread priority: low(-1), normal(0), medium(1), high(2), realtime(3) |
| `--poll` | 0-100 | 50 | Polling level to wait for work |

#### Context & batching

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-c, --ctx-size` | int | 0 (from model) | Prompt context size (env: `LLAMA_ARG_CTX_SIZE`) |
| `-n, --predict` | int | -1 (infinity) | Tokens to predict (env: `LLAMA_ARG_N_PREDICT`) |
| `-b, --batch-size` | int | 2048 | Logical max batch size (env: `LLAMA_ARG_BATCH`) |
| `-ub, --ubatch-size` | int | 512 | Physical max batch size (env: `LLAMA_ARG_UBATCH`) |
| `--keep` | int | 0 (-1=all) | Tokens to keep from initial prompt |
| `--swa-full` | flag | false | Full-size SWA cache (env: `LLAMA_ARG_SWA_FULL`) |

#### Attention & performance

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-fa, --flash-attn` | on\|off\|auto | auto | Flash Attention mode (env: `LLAMA_ARG_FLASH_ATTN`) |
| `--perf, --no-perf` | flag | false | Internal performance timings (env: `LLAMA_ARG_PERF`) |
| `-e, --escape` | flag | true | Process escape sequences (\n, \r, \t) |

#### RoPE scaling

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--rope-scaling` | none\|linear\|yarn | linear | RoPE scaling method (env: `LLAMA_ARG_ROPE_SCALING_TYPE`) |
| `--rope-scale` | float | — | RoPE context scaling factor (env: `LLAMA_ARG_ROPE_SCALE`) |
| `--rope-freq-base` | float | from model | RoPE base frequency (env: `LLAMA_ARG_ROPE_FREQ_BASE`) |
| `--rope-freq-scale` | float | — | RoPE frequency scaling (env: `LLAMA_ARG_ROPE_FREQ_SCALE`) |
| `--yarn-orig-ctx` | int | 0 (from model) | YaRN original context size (env: `LLAMA_ARG_YARN_ORIG_CTX`) |
| `--yarn-ext-factor` | float | -1.0 | YaRN extrapolation mix factor (env: `LLAMA_ARG_YARN_EXT_FACTOR`) |
| `--yarn-attn-factor` | float | -1.0 | YaRN attention magnitude scale (env: `LLAMA_ARG_YARN_ATTN_FACTOR`) |
| `--yarn-beta-slow` | float | -1.0 | YaRN high correction dim (env: `LLAMA_ARG_YARN_BETA_SLOW`) |
| `--yarn-beta-fast` | float | -1.0 | YaRN low correction dim (env: `LLAMA_ARG_YARN_BETA_FAST`) |

#### KV cache & memory

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-kvo, --kv-offload` | flag | enabled | Enable KV cache offloading (env: `LLAMA_ARG_KV_OFFLOAD`) |
| `--repack` | flag | enabled | Enable weight repacking (env: `LLAMA_ARG_REPACK`) |
| `--no-host` | flag | disabled | Bypass host buffer (env: `LLAMA_ARG_NO_HOST`) |
| `-ctk, --cache-type-k` | type | f16 | KV cache type for K: f32, f16, bf16, q8_0, q4_0, q4_1, iq4_nl, q5_0, q5_1 (env: `LLAMA_ARG_CACHE_TYPE_K`) |
| `-ctv, --cache-type-v` | type | f16 | KV cache type for V: same options as K (env: `LLAMA_ARG_CACHE_TYPE_V`) |
| `--mlock` | flag | disabled | Keep model in RAM (env: `LLAMA_ARG_MLOCK`) |
| `--mmap, --no-mmap` | flag | enabled | Memory-map model file (env: `LLAMA_ARG_MMAP`) |
| `-dio, --direct-io` | flag | disabled | Use DirectIO (env: `LLAMA_ARG_DIO`) |
| `--numa` | type | — | NUMA: distribute, isolate, numactl (env: `LLAMA_ARG_NUMA`) |

#### GPU offloading

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-ngl, --gpu-layers` | int\|auto\|all | auto | Max layers in VRAM (env: `LLAMA_ARG_N_GPU_LAYERS`) |
| `-sm, --split-mode` | none\|layer\|row\|tensor | layer | Multi-GPU split mode (env: `LLAMA_ARG_SPLIT_MODE`) |
| `-ts, --tensor-split` | N0,N1,... | — | GPU offload proportions (env: `LLAMA_ARG_TENSOR_SPLIT`) |
| `-mg, --main-gpu` | int | 0 | Primary GPU index (env: `LLAMA_ARG_MAIN_GPU`) |
| `-dev, --device` | dev1,dev2,.. | — | Devices for offloading (env: `LLAMA_ARG_DEVICE`) |
| `--list-devices` | flag | — | Print available devices and exit |
| `-ot, --override-tensor` | pattern=type | — | Override tensor buffer type (env: `LLAMA_ARG_OVERRIDE_TENSOR`) |
| `-fit, --fit` | on\|off | on | Auto-adjust args to fit device memory (env: `LLAMA_ARG_FIT`) |
| `-fitt, --fit-target` | MiB | 1024 | Memory margin per device for --fit (env: `LLAMA_ARG_FIT_TARGET`) |
| `-fitc, --fit-ctx` | int | 4096 | Min ctx size for --fit (env: `LLAMA_ARG_FIT_CTX`) |

#### MoE

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-cmoe, --cpu-moe` | flag | — | Keep MoE weights in CPU (env: `LLAMA_ARG_CPU_MOE`) |
| `-ncmoe, --n-cpu-moe` | int | — | First N layers MoE in CPU (env: `LLAMA_ARG_N_CPU_MOE`) |

#### Model loading

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-m, --model` | path | — | Model file path (env: `LLAMA_ARG_MODEL`) |
| `-mu, --model-url` | url | — | Model download URL (env: `LLAMA_ARG_MODEL_URL`) |
| `-hf, --hf-repo` | user/model[:quant] | — | HuggingFace repo (env: `LLAMA_ARG_HF_REPO`) |
| `-hff, --hf-file` | file | — | HF model file override (env: `LLAMA_ARG_HF_FILE`) |
| `-hfd, --hf-repo-draft` | user/model[:quant] | — | HF draft model repo (env: `LLAMA_ARG_HFD_REPO`) |
| `-hfv, --hf-repo-v` | user/model[:quant] | — | HF vocoder model repo (env: `LLAMA_ARG_HF_REPO_V`) |
| `-hffv, --hf-file-v` | file | — | HF vocoder model file (env: `LLAMA_ARG_HF_FILE_V`) |
| `-hft, --hf-token` | str | HF_TOKEN env | HuggingFace token (env: `HF_TOKEN`) |
| `-dr, --docker-repo` | repo/model[:quant] | — | Docker Hub model repo (env: `LLAMA_ARG_DOCKER_REPO`) |
| `--check-tensors` | flag | false | Validate tensor data |
| `--override-kv` | KEY=TYPE:VALUE | — | Override model metadata |

#### Adapters

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--lora` | FNAME | — | LoRA adapter path (comma-separated for multiple) |
| `--lora-scaled` | FNAME:SCALE | — | LoRA with custom scale |
| `--control-vector` | FNAME | — | Control vector file |
| `--control-vector-scaled` | FNAME:SCALE | — | Control vector with scale |
| `--control-vector-layer-range` | START END | — | Layer range for control vectors |
| `--op-offload` | flag | true | Offload host tensor ops to device |

#### Logging

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-v, --verbose` | flag | — | Maximum verbosity (debug) |
| `-lv, --verbosity` | 0-4 | 3 (info) | Verbosity threshold: 0=generic, 1=error, 2=warning, 3=info, 4=debug (env: `LLAMA_LOG_VERBOSITY`) |
| `--log-disable` | flag | — | Disable logging |
| `--log-file` | FNAME | — | Log to file (env: `LLAMA_LOG_FILE`) |
| `--log-colors` | on\|off\|auto | auto | Colored logging (env: `LLAMA_LOG_COLORS`) |
| `--log-prefix` | flag | — | Enable prefix in log messages (env: `LLAMA_LOG_PREFIX`) |
| `--log-timestamps` | flag | — | Enable timestamps (env: `LLAMA_LOG_TIMESTAMPS`) |
| `--offline` | flag | — | Force cache use, no network (env: `LLAMA_OFFLINE`) |

#### Draft model

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-ctkd, --cache-type-k-draft` | type | f16 | KV cache type K for draft model |
| `-ctvd, --cache-type-v-draft` | type | f16 | KV cache type V for draft model |
| `-otd, --override-tensor-draft` | pattern=type | — | Override tensor buffer type for draft model |
| `-cmoed, --cpu-moe-draft` | flag | — | MoE weights in CPU for draft model (env: `LLAMA_ARG_CPU_MOE_DRAFT`) |
| `-ncmoed, --n-cpu-moe-draft` | int | — | First N layers MoE in CPU for draft (env: `LLAMA_ARG_N_CPU_MOE_DRAFT`) |

## Sampling parameters

### Server defaults (CLI)

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--samplers` | string | penalties;dry;top_n_sigma;top_k;typ_p;top_p;min_p;xtc;temperature | Ordered sampler chain |
| `-s, --seed` | int | -1 (random) | RNG seed |
| `--sampler-seq` | string | edskypmxt | Simplified sampler sequence |
| `--ignore-eos` | flag | false | Ignore end-of-stream token |
| `--temp` | float | 0.80 | Sampling temperature |
| `--top-k` | int | 40 | Top-k sampling (env: `LLAMA_ARG_TOP_K`) |
| `--top-p` | float | 0.95 | Top-p (nucleus) sampling |
| `--min-p` | float | 0.05 | Min-p sampling |
| `--top-nsigma` | float | -1.0 (disabled) | Top-n-sigma sampling |
| `--xtc-probability` | float | 0.00 | XTC probability (0=disabled) |
| `--xtc-threshold` | float | 0.10 | XTC threshold (>0.5=disabled) |
| `--typical, --typical-p` | float | 1.00 (disabled) | Locally typical sampling |
| `--repeat-last-n` | int | 64 | Tokens for repeat penalty (0=off, -1=ctx_size) |
| `--repeat-penalty` | float | 1.00 | Repeat penalty (1.0=disabled) |
| `--presence-penalty` | float | 0.00 | Presence penalty |
| `--frequency-penalty` | float | 0.00 | Frequency penalty |
| `--dry-multiplier` | float | 0.00 | DRY sampling multiplier (0=disabled) |
| `--dry-base` | float | 1.75 | DRY base value |
| `--dry-allowed-length` | int | 2 | DRY allowed length |
| `--dry-penalty-last-n` | int | -1 | DRY penalty token window |
| `--dry-sequence-breaker` | string | \n, :, ", * | DRY sequence breakers |
| `--adaptive-target` | float | -1.00 (disabled) | Adaptive-p target probability |
| `--adaptive-decay` | float | 0.90 | Adaptive-p decay rate |
| `--dynatemp-range` | float | 0.00 (disabled) | Dynamic temperature range |
| `--dynatemp-exp` | float | 1.00 | Dynamic temperature exponent |
| `--mirostat` | int | 0 (disabled) | Mirostat mode: 0=off, 1=Mirostat, 2=Mirostat 2.0 |
| `--mirostat-lr` | float | 0.10 | Mirostat learning rate (eta) |
| `--mirostat-ent` | float | 5.00 | Mirostat target entropy (tau) |
| `-l, --logit-bias` | TOKEN_ID(+/-)BIAS | — | Modify token likelihood |
| `--grammar` | string | — | BNF-like grammar |
| `--grammar-file` | path | — | Grammar file path |
| `-j, --json-schema` | SCHEMA | — | JSON schema constraint |
| `-jf, --json-schema-file` | path | — | JSON schema file |
| `-bs, --backend-sampling` | flag | disabled | Experimental backend sampling (env: `LLAMA_ARG_BACKEND_SAMPLING`) |

## Server-specific parameters

### HTTP server

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--host` | string | 127.0.0.1 | IP address or UNIX socket (.sock) (env: `LLAMA_ARG_HOST`) |
| `--port` | int | 8080 | Port to listen (env: `LLAMA_ARG_PORT`) |
| `--reuse-port` | flag | disabled | Allow multiple sockets on same port (env: `LLAMA_ARG_REUSE_PORT`) |
| `--path` | path | — | Static files directory (env: `LLAMA_ARG_STATIC_PATH`) |
| `--api-prefix` | string | — | URL prefix for all endpoints (env: `LLAMA_ARG_API_PREFIX`) |
| `-to, --timeout` | int | 600 | Read/write timeout in seconds (env: `LLAMA_ARG_TIMEOUT`) |
| `--threads-http` | int | -1 | HTTP request processing threads (env: `LLAMA_ARG_THREADS_HTTP`) |

### Authentication & SSL

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--api-key` | KEY | none | API key(s), comma-separated (env: `LLAMA_API_KEY`) |
| `--api-key-file` | path | none | File containing API keys |
| `--ssl-key-file` | path | — | PEM SSL private key (env: `LLAMA_ARG_SSL_KEY_FILE`) |
| `--ssl-cert-file` | path | — | PEM SSL certificate (env: `LLAMA_ARG_SSL_CERT_FILE`) |

### Slots & batching

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-np, --parallel` | int | -1 (auto) | Number of server slots (env: `LLAMA_ARG_N_PARALLEL`) |
| `-cb, --cont-batching` | flag | enabled | Continuous/dynamic batching (env: `LLAMA_ARG_CONT_BATCHING`) |
| `-sps, --slot-prompt-similarity` | float | 0.10 | Prompt similarity threshold for slot reuse |
| `--context-shift` | flag | disabled | Context shift on infinite generation (env: `LLAMA_ARG_CONTEXT_SHIFT`) |

### Caching

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--cache-prompt` | flag | enabled | Prompt caching / KV reuse (env: `LLAMA_ARG_CACHE_PROMPT`) |
| `--cache-reuse` | int | 0 | Min chunk size for KV shifting reuse (env: `LLAMA_ARG_CACHE_REUSE`) |
| `-cram, --cache-ram` | int | 8192 | Max cache size in MiB (-1=no limit, 0=disable) (env: `LLAMA_ARG_CACHE_RAM`) |
| `-kvu, --kv-unified` | flag | auto | Unified KV buffer across sequences (env: `LLAMA_ARG_KV_UNIFIED`) |
| `--cache-idle-slots` | flag | enabled | Save/clear idle slots (env: `LLAMA_ARG_CACHE_IDLE_SLOTS`) |
| `-ctxcp, --ctx-checkpoints` | int | 32 | Max context checkpoints per slot (env: `LLAMA_ARG_CTX_CHECKPOINTS`) |
| `-cpent, --checkpoint-every-n-tokens` | int | 8192 | Checkpoint interval during prefill (env: `LLAMA_ARG_CHECKPOINT_EVERY_NT`) |
| `--slot-save-path` | path | — | Directory to save/restore slot KV caches |
| `-lcs, --lookup-cache-static` | path | — | Static lookup cache for lookup decoding |
| `-lcd, --lookup-cache-dynamic` | path | — | Dynamic lookup cache |

### Multimodal

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-mm, --mmproj` | path | — | Multimodal projector file (env: `LLAMA_ARG_MMPROJ`) |
| `-mmu, --mmproj-url` | url | — | MM projector URL (env: `LLAMA_ARG_MMPROJ_URL`) |
| `--mmproj-auto, --no-mmproj` | flag | enabled | Auto-detect MM projector with -hf (env: `LLAMA_ARG_MMPROJ_AUTO`) |
| `--mmproj-offload` | flag | enabled | GPU offload for MM projector (env: `LLAMA_ARG_MMPROJ_OFFLOAD`) |
| `--image-min-tokens` | int | from model | Min tokens per image (dynamic resolution) (env: `LLAMA_ARG_IMAGE_MIN_TOKENS`) |
| `--image-max-tokens` | int | from model | Max tokens per image (dynamic resolution) (env: `LLAMA_ARG_IMAGE_MAX_TOKENS`) |
| `--media-path` | path | — | Local media directory for file:// URLs |

### Embeddings & reranking

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--embedding` | flag | disabled | Restrict to embedding use case (env: `LLAMA_ARG_EMBEDDINGS`) |
| `--rerank` | flag | disabled | Enable reranking endpoint (env: `LLAMA_ARG_RERANKING`) |
| `--pooling` | none\|mean\|cls\|last\|rank | from model | Pooling type for embeddings (env: `LLAMA_ARG_POOLING`) |

### Chat templates & reasoning

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--jinja, --no-jinja` | flag | enabled | Jinja template engine (env: `LLAMA_ARG_JINJA`) |
| `--chat-template` | string | from model | Custom Jinja chat template or built-in name (env: `LLAMA_ARG_CHAT_TEMPLATE`) |
| `--chat-template-file` | path | — | Chat template file (env: `LLAMA_ARG_CHAT_TEMPLATE_FILE`) |
| `--chat-template-kwargs` | JSON | — | Additional template params (env: `LLAMA_CHAT_TEMPLATE_KWARGS`) |
| `--reasoning-format` | none\|deepseek\|deepseek-legacy | auto | Reasoning parsing format (env: `LLAMA_ARG_THINK`) |
| `-rea, --reasoning` | on\|off\|auto | auto | Enable reasoning/thinking (env: `LLAMA_ARG_REASONING`) |
| `--reasoning-budget` | int | -1 (unlimited) | Token budget for thinking (0=end, N>0=budget) (env: `LLAMA_ARG_THINK_BUDGET`) |
| `--reasoning-budget-message` | string | none | Message when budget exhausted (env: `LLAMA_ARG_THINK_BUDGET_MESSAGE`) |
| `--skip-chat-parsing` | flag | disabled | Force pure content parser (env: `LLAMA_ARG_SKIP_CHAT_PARSING`) |
| `--prefill-assistant` | flag | enabled | Prefill assistant response (env: `LLAMA_ARG_PREFILL_ASSISTANT`) |

**Built-in chat templates:** bailing, bailing-think, bailing2, chatglm3, chatglm4, chatml, command-r, deepseek, deepseek-ocr, deepseek2, deepseek3, exaone-moe, exaone3, exaone4, falcon3, gemma, gigachat, glmedge, gpt-oss, granite, granite-4.0, grok-2, hunyuan-dense, hunyuan-moe, hunyuan-ocr, kimi-k2, llama2, llama2-sys, llama2-sys-bos, llama2-sys-strip, llama3, llama4, megrez, minicpm, mistral-v1, mistral-v3, mistral-v3-tekken, mistral-v7, mistral-v7-tekken, monarch, openchat, orion, pangu-embedded, phi3, phi4, rwkv-world, seed_oss, smolvlm, solar-open, vicuna, vicuna-orca, yandex, zephyr

### Monitoring

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--metrics` | flag | disabled | Prometheus metrics endpoint (env: `LLAMA_ARG_ENDPOINT_METRICS`) |
| `--props` | flag | disabled | POST /props for changing global properties (env: `LLAMA_ARG_ENDPOINT_PROPS`) |
| `--slots, --no-slots` | flag | enabled | Slots monitoring endpoint (env: `LLAMA_ARG_ENDPOINT_SLOTS`) |

### Web UI & tools

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--webui, --no-webui` | flag | enabled | Enable Web UI (env: `LLAMA_ARG_WEBUI`) |
| `--webui-config` | JSON | — | Default WebUI settings (env: `LLAMA_ARG_WEBUI_CONFIG`) |
| `--webui-config-file` | path | — | WebUI settings file (env: `LLAMA_ARG_WEBUI_CONFIG_FILE`) |
| `--webui-mcp-proxy` | flag | disabled | MCP CORS proxy (env: `LLAMA_ARG_WEBUI_MCP_PROXY`) |
| `--tools` | list | none | Built-in tools: read_file, file_glob_search, grep_search, exec_shell_command, write_file, edit_file, apply_diff (env: `LLAMA_ARG_TOOLS`) |

### Model aliases & info

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-a, --alias` | string | — | Model name aliases, comma-separated (env: `LLAMA_ARG_ALIAS`) |
| `--tags` | string | — | Model tags, comma-separated (env: `LLAMA_ARG_TAGS`) |

### Speculative decoding

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-md, --model-draft` | path | — | Draft model path (env: `LLAMA_ARG_MODEL_DRAFT`) |
| `--draft, --draft-max` | int | 16 | Max draft tokens (env: `LLAMA_ARG_DRAFT_MAX`) |
| `--draft-min` | int | 0 | Min draft tokens (env: `LLAMA_ARG_DRAFT_MIN`) |
| `--draft-p-min` | float | 0.75 | Min speculative probability (env: `LLAMA_ARG_DRAFT_P_MIN`) |
| `-cd, --ctx-size-draft` | int | 0 (from model) | Draft model context size (env: `LLAMA_ARG_CTX_SIZE_DRAFT`) |
| `-ngld, --gpu-layers-draft` | int\|auto\|all | auto | Draft model GPU layers (env: `LLAMA_ARG_N_GPU_LAYERS_DRAFT`) |
| `-devd, --device-draft` | list | — | Devices for draft model |
| `-td, --threads-draft` | int | same as `--threads` | Draft model generation threads |
| `-tbd, --threads-batch-draft` | int | same as `--threads-draft` | Draft model batch threads |
| `--spec-type` | type | none | Ngram speculative: none, ngram-cache, ngram-simple, ngram-map-k, ngram-map-k4v, ngram-mod (env: `LLAMA_ARG_SPEC_TYPE`) |
| `--spec-ngram-size-n` | int | 12 | Ngram size N |
| `--spec-ngram-size-m` | int | 48 | Ngram size M |
| `--spec-ngram-min-hits` | int | 1 | Min hits for ngram-map |
| `--spec-replace` | TARGET DRAFT | — | Translate target string to draft |

### Router / multi-model serving

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--models-dir` | path | — | Models directory for router (env: `LLAMA_ARG_MODELS_DIR`) |
| `--models-preset` | path | — | INI preset file (env: `LLAMA_ARG_MODELS_PRESET`) |
| `--models-max` | int | 4 | Max simultaneous models (0=unlimited) (env: `LLAMA_ARG_MODELS_MAX`) |
| `--models-autoload` | flag | enabled | Auto-load requested models (env: `LLAMA_ARG_MODELS_AUTOLOAD`) |
| `--sleep-idle-seconds` | int | -1 (disabled) | Idle seconds before sleep mode |

### Other

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `-r, --reverse-prompt` | string | — | Halt generation at prompt |
| `-sp, --special` | flag | false | Output special tokens |
| `--warmup` | flag | enabled | Warmup with empty run |
| `--spm-infill` | flag | disabled | SPM pattern for infill |
| `-mv, --model-vocoder` | path | — | Vocoder model for TTS |
| `--tts-use-guide-tokens` | flag | — | Guide tokens for TTS |
| `--lora-init-without-apply` | flag | disabled | Load LoRA without applying |
| `--alias` | string | — | Model name alias |

### Default model shortcuts

| Argument | Description |
|----------|-------------|
| `--embd-gemma-default` | Use EmbeddingGemma |
| `--fim-qwen-1.5b-default` | Qwen 2.5 Coder 1.5B |
| `--fim-qwen-3b-default` | Qwen 2.5 Coder 3B |
| `--fim-qwen-7b-default` | Qwen 2.5 Coder 7B |
| `--fim-qwen-7b-spec` | Qwen 2.5 Coder 7B + 0.5B draft |
| `--fim-qwen-14b-spec` | Qwen 2.5 Coder 14B + 0.5B draft |
| `--fim-qwen-30b-default` | Qwen 3 Coder 30B A3B |
| `--gpt-oss-20b-default` | gpt-oss-20b |
| `--gpt-oss-120b-default` | gpt-oss-120b |
| `--vision-gemma-4b-default` | Gemma 3 4B QAT |
| `--vision-gemma-12b-default` | Gemma 3 12B QAT |
| `--spec-default` | Default speculative decoding config |

## API endpoints

### POST `/completion` — Text completion (non-OAI)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string/array/mixed | required | Prompt text, token IDs, or mixed. Supports multimodal objects. |
| `temperature` | float | 0.8 | Sampling temperature |
| `dynatemp_range` | float | 0.0 | Dynamic temperature range |
| `dynatemp_exp` | float | 1.0 | Dynamic temperature exponent |
| `top_k` | int | 40 | Top-k sampling |
| `top_p` | float | 0.95 | Top-p sampling |
| `min_p` | float | 0.05 | Min-p sampling |
| `n_predict` | int | -1 (infinity) | Max tokens to generate |
| `n_indent` | int | 0 | Min line indentation |
| `n_keep` | int | 0 | Tokens to retain on overflow |
| `n_cmpl` | int | — | Number of completions per prompt |
| `n_cache_reuse` | int | 0 | Min chunk for KV shifting |
| `stream` | bool | false | Stream tokens |
| `stop` | array | [] | Stop sequences |
| `typical_p` | float | 1.0 | Locally typical sampling |
| `repeat_penalty` | float | 1.1 | Repeat penalty |
| `repeat_last_n` | int | 64 | Tokens for repeat penalty |
| `presence_penalty` | float | 0.0 | Presence penalty |
| `frequency_penalty` | float | 0.0 | Frequency penalty |
| `dry_multiplier` | float | 0.0 | DRY multiplier |
| `dry_base` | float | 1.75 | DRY base |
| `dry_allowed_length` | int | 2 | DRY allowed length |
| `dry_penalty_last_n` | int | -1 | DRY penalty window |
| `dry_sequence_breakers` | array | [\n,:,",*] | DRY breakers |
| `xtc_probability` | float | 0.0 | XTC probability |
| `xtc_threshold` | float | 0.1 | XTC threshold |
| `mirostat` | int | 0 | Mirostat mode (0/1/2) |
| `mirostat_tau` | float | 5.0 | Mirostat target entropy |
| `mirostat_eta` | float | 0.1 | Mirostat learning rate |
| `grammar` | string | — | BNF grammar |
| `json_schema` | object | — | JSON schema |
| `seed` | int | -1 (random) | RNG seed |
| `ignore_eos` | bool | false | Ignore EOS token |
| `logit_bias` | array/object | [] | Token likelihood bias |
| `n_probs` | int | 0 | Return top-N token probabilities |
| `min_keep` | int | 0 | Min tokens from samplers |
| `t_max_predict_ms` | int | 0 | Time limit for prediction (ms) |
| `id_slot` | int | -1 | Assign to specific slot |
| `cache_prompt` | bool | true | Reuse KV cache from previous |
| `return_tokens` | bool | false | Return raw token IDs |
| `samplers` | array | [dry,top_k,typ_p,top_p,min_p,xtc,temperature] | Sampler chain |
| `timings_per_token` | bool | false | Include timing per token |
| `return_progress` | bool | false | Include prefill progress in stream |
| `post_sampling_probs` | bool | false | Post-sampling probabilities |
| `response_fields` | array | — | Select specific response fields |
| `lora` | array | — | Per-request LoRA: [{id, scale}] |

### POST `/v1/chat/completions` — OpenAI Chat Completions

Standard OpenAI parameters plus llama.cpp-specific extensions:
- `chat_template_kwargs` — Additional template params (e.g., `{"enable_thinking": false}`)
- `reasoning_format` — Reasoning parsing format override
- `generation_prompt` — Prefilled generation prompt
- `parse_tool_calls` — Whether to parse tool calls
- `parallel_tool_calls` — Enable parallel tool calls
- All `/completion` sampling params supported

### POST `/v1/completions` — OpenAI Completions

Standard OpenAI parameters. All `/completion` sampling params supported.

### POST `/v1/responses` — OpenAI Responses API

Converts to Chat Completions internally. Supports `instructions` and `input`.

### POST `/v1/embeddings` — OpenAI Embeddings

Standard OpenAI parameters. Requires pooling type other than `none`.

### POST `/embedding` — Native Embeddings (non-OAI)

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Text to embed (supports multimodal) |
| `embd_normalize` | int | -1=none, 0=max_abs, 1=taxicab, 2=euclidean, >2=p-norm |

### POST `/reranking` — Reranking

Aliases: `/rerank`, `/v1/rerank`, `/v1/reranking`

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Query to rank against |
| `documents` | array | Documents to rank |
| `top_n` | int | Top results to return |

### POST `/infill` — Code Infilling

| Parameter | Type | Description |
|-----------|------|-------------|
| `input_prefix` | string | Code prefix |
| `input_suffix` | string | Code suffix |
| `input_extra` | array | Additional context: [{filename, text}] |
| `prompt` | string | Added after FIM_MID token |

### POST `/tokenize`

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Required. Text to tokenize |
| `add_special` | bool | Insert BOS etc. (default: false) |
| `parse_special` | bool | Tokenize special tokens (default: true) |
| `with_pieces` | bool | Return token pieces (default: false) |

### POST `/detokenize`

| Parameter | Type | Description |
|-----------|------|-------------|
| `tokens` | array | Token IDs to convert |

### POST `/apply-template`

| Parameter | Type | Description |
|-----------|------|-------------|
| `messages` | array | Chat messages (same format as /v1/chat/completions) |

### GET `/health` — Health check
Returns `{"status": "ok"}` or loading error. Also at `/v1/health`.

### GET `/props` — Server properties
Returns default generation settings, total slots, model path, chat template, modalities, sleeping status.

### GET `/slots` — Slot monitoring
Returns processing state for each slot with current params, timings, and token counts.

### POST `/slots/{id}?action=save|restore|erase` — Slot KV cache management
Save/restore/erase slot KV caches to/from files.

### GET `/lora-adapters` — List LoRA adapters
Returns loaded adapters with id, path, and scale.

### POST `/lora-adapters` — Set LoRA scales
Set global adapter scales: `[{"id": 0, "scale": 0.2}, ...]`

### GET `/metrics` — Prometheus metrics
Metrics: prompt_tokens_total, tokens_predicted_total, prompt_tokens_seconds, predicted_tokens_seconds, kv_cache_usage_ratio, kv_cache_tokens, requests_processing, requests_deferred, n_tokens_max.

### GET `/models` — List models (router mode)
List cached models with status (loaded/unloaded/loading/sleeping).

### POST `/models/load` — Load model (router mode)
Load a model by name.

### POST `/models/unload` — Unload model (router mode)
Unload a model by name.

## GGUF quantization types

### Legacy quantization

| Type | Bits/weight | Description |
|------|-------------|-------------|
| `Q4_0` | 4.5 | 4-bit, block size 32, basic |
| `Q4_1` | 4.5 | 4-bit with min/max per block |
| `Q5_0` | 5.5 | 5-bit, block size 32 |
| `Q5_1` | 5.5 | 5-bit with min/max per block |
| `Q8_0` | 8.5 | 8-bit quantization |
| `F16` | 16.0 | Half precision |
| `F32` | 32.0 | Full precision |
| `BF16` | 16.0 | Brain float16 |

### K-Quants

| Type | Bits/weight | Description |
|------|-------------|-------------|
| `Q2_K` | ~3.35 | 2-bit with super-block quantization |
| `Q2_K_S` | ~2.97 | Smaller 2-bit K-quant |
| `Q3_K_S` | ~3.64 | 3-bit small |
| `Q3_K_M` | ~4.00 | 3-bit medium |
| `Q3_K_L` | ~4.30 | 3-bit large |
| `Q4_K_S` | ~4.67 | 4-bit small |
| `Q4_K_M` | ~4.89 | 4-bit medium (recommended) |
| `Q5_K_S` | ~5.57 | 5-bit small |
| `Q5_K_M` | ~5.70 | 5-bit medium |
| `Q6_K` | ~6.56 | 6-bit K-quant (near-lossless) |

### I-Quants (importance matrix)

| Type | Bits/weight | Description |
|------|-------------|-------------|
| `IQ1_S` | ~2.00 | 1-bit, small |
| `IQ1_M` | ~2.15 | 1-bit, medium |
| `IQ2_XXS` | ~2.38 | 2-bit, extra-extra-small |
| `IQ2_XS` | ~2.59 | 2-bit, extra-small |
| `IQ2_S` | ~2.74 | 2-bit, small |
| `IQ2_M` | ~2.93 | 2-bit, medium |
| `IQ3_XXS` | ~3.25 | 3-bit, extra-extra-small |
| `IQ3_XS` | ~3.50 | 3-bit, extra-small |
| `IQ3_S` | ~3.66 | 3-bit, small |
| `IQ3_M` | ~3.76 | 3-bit, medium |
| `IQ4_XS` | ~4.46 | 4-bit, extra-small |
| `IQ4_NL` | ~4.68 | 4-bit, non-linear |

### Recommended quantization guide

| Use case | Recommended type |
|----------|-----------------|
| Best quality | `Q6_K` or `Q8_0` |
| Balanced quality/speed | `Q4_K_M` or `Q5_K_M` |
| Maximum compression | `IQ2_M` or `IQ3_M` (with imatrix) |
| Fastest inference | `Q4_0` or `Q4_K_S` |

## Environment variables

All `LLAMA_ARG_*` variables correspond to their CLI argument equivalents. Boolean env vars accept: `true`, `1`, `on`, `enabled` (true) and `false`, `0`, `off`, `disabled` (false). Negated forms use `LLAMA_ARG_NO_*` prefix.

| Variable | Maps to |
|----------|---------|
| `LLAMA_ARG_THREADS` | `--threads` |
| `LLAMA_ARG_CTX_SIZE` | `--ctx-size` |
| `LLAMA_ARG_N_PREDICT` | `--n-predict` |
| `LLAMA_ARG_BATCH` | `--batch-size` |
| `LLAMA_ARG_UBATCH` | `--ubatch-size` |
| `LLAMA_ARG_FLASH_ATTN` | `--flash-attn` |
| `LLAMA_ARG_PERF` | `--perf` |
| `LLAMA_ARG_ROPE_SCALING_TYPE` | `--rope-scaling` |
| `LLAMA_ARG_ROPE_SCALE` | `--rope-scale` |
| `LLAMA_ARG_ROPE_FREQ_BASE` | `--rope-freq-base` |
| `LLAMA_ARG_ROPE_FREQ_SCALE` | `--rope-freq-scale` |
| `LLAMA_ARG_KV_OFFLOAD` | `--kv-offload` |
| `LLAMA_ARG_CACHE_TYPE_K` | `--cache-type-k` |
| `LLAMA_ARG_CACHE_TYPE_V` | `--cache-type-v` |
| `LLAMA_ARG_MLOCK` | `--mlock` |
| `LLAMA_ARG_MMAP` | `--mmap` |
| `LLAMA_ARG_NUMA` | `--numa` |
| `LLAMA_ARG_DEVICE` | `--device` |
| `LLAMA_ARG_N_GPU_LAYERS` | `--gpu-layers` |
| `LLAMA_ARG_SPLIT_MODE` | `--split-mode` |
| `LLAMA_ARG_TENSOR_SPLIT` | `--tensor-split` |
| `LLAMA_ARG_MAIN_GPU` | `--main-gpu` |
| `LLAMA_ARG_MODEL` | `--model` |
| `LLAMA_ARG_MODEL_URL` | `--model-url` |
| `LLAMA_ARG_HF_REPO` | `--hf-repo` |
| `LLAMA_ARG_HF_FILE` | `--hf-file` |
| `LLAMA_ARG_HF_REPO_V` | `--hf-repo-v` |
| `LLAMA_ARG_HF_FILE_V` | `--hf-file-v` |
| `LLAMA_ARG_HFD_REPO` | `--hf-repo-draft` |
| `LLAMA_ARG_CPU_MOE` | `--cpu-moe` |
| `LLAMA_ARG_N_CPU_MOE` | `--n-cpu-moe` |
| `LLAMA_ARG_HOST` | `--host` |
| `LLAMA_ARG_PORT` | `--port` |
| `LLAMA_ARG_REUSE_PORT` | `--reuse-port` |
| `LLAMA_ARG_TIMEOUT` | `--timeout` |
| `LLAMA_ARG_THREADS_HTTP` | `--threads-http` |
| `LLAMA_ARG_API_KEY` | `--api-key` |
| `LLAMA_ARG_SSL_KEY_FILE` | `--ssl-key-file` |
| `LLAMA_ARG_SSL_CERT_FILE` | `--ssl-cert-file` |
| `LLAMA_ARG_TOP_K` | `--top-k` |
| `LLAMA_ARG_CACHE_PROMPT` | `--cache-prompt` |
| `LLAMA_ARG_CACHE_REUSE` | `--cache-reuse` |
| `LLAMA_ARG_CACHE_RAM` | `--cache-ram` |
| `LLAMA_ARG_KV_UNIFIED` | `--kv-unified` |
| `LLAMA_ARG_CACHE_IDLE_SLOTS` | `--cache-idle-slots` |
| `LLAMA_ARG_CTX_CHECKPOINTS` | `--ctx-checkpoints` |
| `LLAMA_ARG_CHECKPOINT_EVERY_NT` | `--checkpoint-every-n-tokens` |
| `LLAMA_ARG_CONTEXT_SHIFT` | `--context-shift` |
| `LLAMA_ARG_N_PARALLEL` | `--parallel` |
| `LLAMA_ARG_CONT_BATCHING` | `--cont-batching` |
| `LLAMA_ARG_MMPROJ` | `--mmproj` |
| `LLAMA_ARG_MMPROJ_AUTO` | `--mmproj-auto` |
| `LLAMA_ARG_MMPROJ_OFFLOAD` | `--mmproj-offload` |
| `LLAMA_ARG_POOLING` | `--pooling` |
| `LLAMA_ARG_EMBEDDINGS` | `--embedding` |
| `LLAMA_ARG_RERANKING` | `--rerank` |
| `LLAMA_ARG_ENDPOINT_METRICS` | `--metrics` |
| `LLAMA_ARG_ENDPOINT_PROPS` | `--props` |
| `LLAMA_ARG_ENDPOINT_SLOTS` | `--slots` |
| `LLAMA_ARG_JINJA` | `--jinja` |
| `LLAMA_ARG_CHAT_TEMPLATE` | `--chat-template` |
| `LLAMA_ARG_CHAT_TEMPLATE_FILE` | `--chat-template-file` |
| `LLAMA_ARG_THINK` | `--reasoning-format` |
| `LLAMA_ARG_REASONING` | `--reasoning` |
| `LLAMA_ARG_THINK_BUDGET` | `--reasoning-budget` |
| `LLAMA_ARG_THINK_BUDGET_MESSAGE` | `--reasoning-budget-message` |
| `LLAMA_ARG_SKIP_CHAT_PARSING` | `--skip-chat-parsing` |
| `LLAMA_ARG_PREFILL_ASSISTANT` | `--prefill-assistant` |
| `LLAMA_CHAT_TEMPLATE_KWARGS` | `--chat-template-kwargs` |
| `LLAMA_ARG_ALIAS` | `--alias` |
| `LLAMA_ARG_TAGS` | `--tags` |
| `LLAMA_ARG_WEBUI` | `--webui` |
| `LLAMA_ARG_WEBUI_CONFIG` | `--webui-config` |
| `LLAMA_ARG_WEBUI_CONFIG_FILE` | `--webui-config-file` |
| `LLAMA_ARG_WEBUI_MCP_PROXY` | `--webui-mcp-proxy` |
| `LLAMA_ARG_TOOLS` | `--tools` |
| `LLAMA_ARG_MODELS_DIR` | `--models-dir` |
| `LLAMA_ARG_MODELS_PRESET` | `--models-preset` |
| `LLAMA_ARG_MODELS_MAX` | `--models-max` |
| `LLAMA_ARG_MODELS_AUTOLOAD` | `--models-autoload` |
| `LLAMA_ARG_MODEL_DRAFT` | `--model-draft` |
| `LLAMA_ARG_DRAFT_MAX` | `--draft-max` |
| `LLAMA_ARG_DRAFT_MIN` | `--draft-min` |
| `LLAMA_ARG_DRAFT_P_MIN` | `--draft-p-min` |
| `LLAMA_ARG_CTX_SIZE_DRAFT` | `--ctx-size-draft` |
| `LLAMA_ARG_N_GPU_LAYERS_DRAFT` | `--gpu-layers-draft` |
| `LLAMA_ARG_SPEC_TYPE` | `--spec-type` |
| `LLAMA_ARG_BACKEND_SAMPLING` | `--backend-sampling` |
| `LLAMA_ARG_SWA_FULL` | `--swa-full` |
| `LLAMA_ARG_FIT` | `--fit` |
| `LLAMA_ARG_FIT_TARGET` | `--fit-target` |
| `LLAMA_ARG_FIT_CTX` | `--fit-ctx` |
| `LLAMA_ARG_REPACK` | `--repack` |
| `LLAMA_ARG_NO_HOST` | `--no-host` |
| `LLAMA_ARG_DEFRAG_THOLD` | `--defrag-thold` (DEPRECATED) |
| `LLAMA_ARG_DIO` | `--direct-io` |
| `LLAMA_ARG_STATIC_PATH` | `--path` |
| `LLAMA_ARG_API_PREFIX` | `--api-prefix` |
| `LLAMA_ARG_IMAGE_MIN_TOKENS` | `--image-min-tokens` |
| `LLAMA_ARG_IMAGE_MAX_TOKENS` | `--image-max-tokens` |
| `LLAMA_OFFLINE` | `--offline` |
| `HF_TOKEN` | `--hf-token` |
| `LLAMA_LOG_FILE` | `--log-file` |
| `LLAMA_LOG_COLORS` | `--log-colors` |
| `LLAMA_LOG_VERBOSITY` | `--verbosity` |
| `LLAMA_LOG_PREFIX` | `--log-prefix` |
| `LLAMA_LOG_TIMESTAMPS` | `--log-timestamps` |

## Hardware backends

| Backend | Platform | Notes |
|---------|----------|-------|
| CUDA | NVIDIA GPU | Primary GPU backend, cuBLAS |
| Metal | Apple Silicon | M1/M2/M3/M4, GPU compute |
| Vulkan | Cross-platform | AMD, Intel, ARM GPUs |
| SYCL | Intel GPU | OneAPI / Level Zero |
| HIP/ROCm | AMD GPU | ROCm HIP runtime |
| CANN | Ascend NPU | Huawei Ascend |
| RPC | Remote | Distributed inference |
| CPU | All | Fallback, optimized SIMD |

## Quantize tool options

`llama-quantize` converts GGUF models between quantization types:

```bash
./llama-quantize [options] input.gguf output.gguf TYPE [threads]
```

| Option | Description |
|--------|-------------|
| `--allow-requantize` | Re-quantize already quantized tensors |
| `--leave-output-tensor` | Leave output.weight unquantized |
| `--pure` | Disable k-quant mixtures |
| `--imatrix FILE` | Use importance matrix |
| `--include-weights` | Apply imatrix to specific tensors |
| `--exclude-weights` | Exclude tensors from imatrix |
| `--output-tensor-type TYPE` | Override output tensor quant type |
| `--token-embedding-type TYPE` | Override embedding tensor quant type |
| `--keep-split` | Match input file shard structure |
| `--tensor-type PATTERN=TYPE` | Per-tensor regex quantization |
| `--prune-layers LIST` | Remove specific layers |
| `--override-kv KEY=TYPE:VALUE` | Override model metadata |

## Model presets (INI format)

The router server supports model presets via INI files:

```ini
version = 1
[*]
c = 8192
n-gpu-layers = 8

[ggml-org/MY-MODEL-GGUF:Q8_0]
chat-template = chatml
n-gpu-layers = 123
c = 4096
```

Preset-only options:
- `load-on-startup` (bool) — Auto-load on server start
- `stop-timeout` (int, seconds) — Wait before force-terminate after unload

Precedence: CLI args > model-specific preset > global preset
