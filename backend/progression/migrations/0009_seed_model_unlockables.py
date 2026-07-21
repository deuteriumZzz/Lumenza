# Seeds ModelUnlockable with a snapshot of every (provider, model) candidate
# currently in providers.TASK_ROUTES (as of 2026-07-20) — see
# progression/models.py's ModelUnlockable docstring for why this is a
# hand-maintained copy, not a live read of TASK_ROUTES. Thresholds are a
# simple position-based ladder (index 0 = the category's primary = free the
# moment the category itself unlocks; each further position adds 4 requests
# / 1 distinct day), not individually hand-tuned — same placeholder spirit
# as this project's NVIDIA pricing TODOs elsewhere.

from django.db import migrations

# (task, [(provider, model), ...]) — order matches TASK_ROUTES exactly,
# index 0 is each category's primary.
CATALOG = [
    (
        "hook",
        [
            ("anthropic", "claude-3-5-sonnet-latest"),
            ("openai", "gpt-4o-mini"),
            ("nvidia", "nvidia/nvidia-nemotron-nano-9b-v2"),
            ("nvidia", "deepseek-ai/deepseek-v4-flash"),
            ("nvidia", "openai/gpt-oss-120b"),
            ("nvidia", "bytedance/seed-oss-36b-instruct"),
        ],
    ),
    (
        "longform",
        [
            ("anthropic", "claude-3-5-sonnet-latest"),
            ("openai", "gpt-4o-mini"),
            ("nvidia", "nvidia/llama-3.3-nemotron-super-49b-v1.5"),
            ("nvidia", "minimaxai/minimax-m3"),
            ("nvidia", "abacusai/dracarys-llama-3.1-70b-instruct"),
            ("nvidia", "meta/llama-3.1-70b-instruct"),
            ("nvidia", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"),
            ("nvidia", "nvidia/nemotron-3-super-120b-a12b"),
        ],
    ),
    (
        "hashtags",
        [
            ("google", "gemini-1.5-flash"),
            ("openai", "gpt-4o-mini"),
            ("nvidia", "meta/llama-3.2-3b-instruct"),
            ("nvidia", "nvidia/nemotron-mini-4b-instruct"),
            ("nvidia", "stepfun-ai/step-3.7-flash"),
            ("nvidia", "nvidia/nemotron-3-nano-30b-a3b"),
            ("nvidia", "google/gemma-3n-e2b-it"),
            ("nvidia", "stepfun-ai/step-3.5-flash"),
        ],
    ),
    (
        "content_plan",
        [
            ("anthropic", "claude-3-5-sonnet-latest"),
            ("google", "gemini-1.5-flash"),
            ("nvidia", "qwen/qwen3.5-122b-a10b"),
            ("nvidia", "nvidia/llama-3.3-nemotron-super-49b-v1"),
            ("nvidia", "upstage/solar-10.7b-instruct"),
            ("nvidia", "nvidia/nemotron-3-ultra-550b-a55b"),
            ("nvidia", "mistralai/mistral-small-4-119b-2603"),
        ],
    ),
    (
        "repurpose",
        [
            ("openai", "gpt-4o-mini"),
            ("anthropic", "claude-3-5-sonnet-latest"),
            ("nvidia", "meta/llama-3.1-8b-instruct"),
            ("nvidia", "google/gemma-2-2b-it"),
            ("nvidia", "minimaxai/minimax-m2.7"),
            ("nvidia", "mistralai/mistral-nemotron"),
            ("nvidia", "google/gemma-3n-e4b-it"),
            ("nvidia", "poolside/laguna-xs-2.1"),
        ],
    ),
    (
        "translation",
        [
            ("google", "gemini-1.5-flash"),
            ("anthropic", "claude-3-5-sonnet-latest"),
            ("nvidia", "qwen/qwen3-next-80b-a3b-instruct"),
            ("nvidia", "sarvamai/sarvam-m"),
            ("nvidia", "nvidia/riva-translate-4b-instruct-v1.1"),
            ("nvidia", "thinkingmachines/inkling"),
            ("nvidia", "openai/gpt-oss-20b"),
        ],
    ),
]

REQUESTS_PER_POSITION = 4
DAYS_PER_POSITION = 1


def seed(apps, schema_editor):
    ModelUnlockable = apps.get_model("progression", "ModelUnlockable")
    rows = []
    for task, candidates in CATALOG:
        for position, (provider, model) in enumerate(candidates):
            rows.append(
                ModelUnlockable(
                    task=task,
                    provider=provider,
                    model=model,
                    min_requests=position * REQUESTS_PER_POSITION,
                    min_distinct_days=position * DAYS_PER_POSITION,
                    sort_order=position,
                )
            )
    ModelUnlockable.objects.bulk_create(rows)


def unseed(apps, schema_editor):
    ModelUnlockable = apps.get_model("progression", "ModelUnlockable")
    tasks = [task for task, _ in CATALOG]
    ModelUnlockable.objects.filter(task__in=tasks).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("progression", "0008_modelunlockable_usermodelunlock"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
