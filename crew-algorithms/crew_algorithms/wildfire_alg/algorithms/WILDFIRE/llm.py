"""The one place where WILDFIRE decides which language model to talk to.

The provider is ``cfg.envs.llm_model``:

* ``gpt``   - OpenAI's API (the default). Model names come from MODEL_MAP and the key
              from the OPENAI_API_KEY environment variable.
* ``local`` - any OpenAI-compatible server, in the deployment the vLLM container. The
              base URL is ``cfg.envs.llm_url``, the model id is ``cfg.envs.model_name``
              and the key is LLM_API_KEY if set, otherwise the placeholder "EMPTY"
              (vLLM accepts any key).
* the other names in PROVIDERS are the hosted providers used for the paper's runs.

The algorithm service selects ``local`` by passing hydra overrides to the WILDFIRE
subprocess (``envs.llm_model=local envs.llm_url=... envs.model_name=...``).

This module deliberately imports nothing heavy (no torch, no Unity) so the service can
import it too.
"""
import os

from openai import AsyncOpenAI, OpenAI

from crew_algorithms.wildfire_alg.config.configs import (
    DeepseekLLMConfig,
    ErnieLLMConfig,
    GemmaLLMConfig,
    GlmLLMConfig,
    KimiLLMConfig,
    LlamaLLMConfig,
    MinimaxLLMConfig,
    NemotronLLMConfig,
    QwenLLMConfig,
)

# Prompt files shipped with the algorithm, resolved relative to this file so that the
# working directory does not matter.
PROMPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts")

PROVIDERS = ("gpt", "local", "qwen", "deepseek", "gemma", "glm", "llama", "ernie", "nemotron", "minimax", "kimi")

# depth "high": complex reasoning (manager planning); "low": fast responses
OPENAI_MODELS = {"high": "gpt-5.4", "low": "gpt-5.4-nano"}

MODEL_MAP = {
    "gpt": OPENAI_MODELS,
    "qwen": {
        "high": "Qwen/Qwen3.6-35B-A3B",
        "low": "Qwen/Qwen3.6-35B-A3B",
    },
    "deepseek": {
        "high": "deepseek-ai/DeepSeek-V4-Pro",
        "low": "deepseek-ai/DeepSeek-V4-Pro",
    },
    "gemma": {
        "high": "google/gemma-4-31B-it",
        "low": "google/gemma-4-31B-it",
    },
    "glm": {
        "high": "zai-org/GLM-5.1-FP8",
        "low": "zai-org/GLM-5.1-FP8",
    },
    "llama": {
        "high": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
        "low": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    },
    "ernie": {
        "high": "baidu/ERNIE-4.5-21B-A3B-PT",
        "low": "baidu/ERNIE-4.5-21B-A3B-PT",
    },
    "nemotron": {
        "high": "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16",
        "low": "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16",
    },
    "minimax": {
        "high": "MiniMaxAI/MiniMax-M3-MXFP8",
        "low": "MiniMaxAI/MiniMax-M3-MXFP8",
    },
    "kimi": {
        "high": "moonshotai/Kimi-K2.6",
        "low": "moonshotai/Kimi-K2.6",
    },
}

# Per-provider defaults copied onto cfg.llms (the fields below) by apply_provider_defaults
PROVIDER_CONFIGS = {
    "qwen": QwenLLMConfig,
    "deepseek": DeepseekLLMConfig,
    "gemma": GemmaLLMConfig,
    "glm": GlmLLMConfig,
    "llama": LlamaLLMConfig,
    "ernie": ErnieLLMConfig,
    "nemotron": NemotronLLMConfig,
    "minimax": MinimaxLLMConfig,
    "kimi": KimiLLMConfig,
}

LLM_MODEL_FIELDS = (
    "actor_model", "critic_model", "planner_model", "translator_model",
    "large_model", "small_model", "reasoning_model",
)


def _envs(cfg):
    return getattr(cfg, "envs", cfg)


def get_provider(cfg) -> str:
    return getattr(_envs(cfg), "llm_model", "gpt") or "gpt"


def is_openai(cfg) -> bool:
    return get_provider(cfg) == "gpt"


def get_base_url(cfg):
    return getattr(_envs(cfg), "llm_url", None)


def resolve_model(cfg, depth: str = "low") -> str:
    """The model id to request. ``envs.model_name`` wins when set; otherwise the
    provider's default for the given depth ("high" or "low")."""
    explicit = getattr(_envs(cfg), "model_name", "") or None
    if explicit:
        return explicit
    provider = get_provider(cfg)
    if provider == "local":
        raise ValueError("llm_model=local requires envs.model_name (the model id served by the local server)")
    return MODEL_MAP.get(provider, OPENAI_MODELS).get(depth, OPENAI_MODELS["low"])


def resolve_api_key(cfg) -> str:
    provider = get_provider(cfg)
    if provider == "gpt":
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise ValueError("OPENAI_API_KEY is not set (required for llm_model=gpt)")
        return key
    if provider == "local":
        return os.getenv("LLM_API_KEY") or "EMPTY"
    return os.getenv(f"{provider.upper()}_API_KEY", "ernie-123")


def apply_provider_defaults(cfg) -> None:
    """Validate the provider and set the model-name fields of ``cfg.llms`` for it."""
    provider = get_provider(cfg)
    if provider not in PROVIDERS:
        raise ValueError(f"Unsupported llm_model '{provider}'. Supported: {PROVIDERS}")
    if provider == "gpt":
        return
    if provider == "local":
        model = resolve_model(cfg)
        for field in LLM_MODEL_FIELDS:
            setattr(cfg.llms, field, model)
        return
    defaults = PROVIDER_CONFIGS[provider]()
    for field in LLM_MODEL_FIELDS:
        setattr(cfg.llms, field, getattr(defaults, field))


def make_async_client(cfg, api_key: str, timeout: float = 3600) -> AsyncOpenAI:
    if is_openai(cfg):
        return AsyncOpenAI(api_key=api_key, timeout=timeout)
    return AsyncOpenAI(api_key=api_key, base_url=get_base_url(cfg), timeout=timeout)


def make_sync_client(cfg, api_key: str, timeout: float = 3600) -> OpenAI:
    if is_openai(cfg):
        return OpenAI(api_key=api_key, timeout=timeout)
    return OpenAI(api_key=api_key, base_url=get_base_url(cfg), timeout=timeout)


def completion_kwargs(cfg, temperature=None) -> dict:
    """Extra keyword arguments for chat.completions.create.

    OpenAI: nothing extra (its defaults are used). Other providers: a fixed temperature when
    the caller asks for one, and the chat-template flag that keeps thinking-style models
    (e.g. Qwen) from emitting reasoning text; templates without that flag ignore it.
    """
    if is_openai(cfg):
        return {}
    kwargs = {"extra_body": {"chat_template_kwargs": {"enable_thinking": False}}}
    if temperature is not None:
        kwargs["temperature"] = temperature
    return kwargs
