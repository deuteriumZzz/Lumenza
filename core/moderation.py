import re

from django.conf import settings

# Cheap, always-on keyword prefilter — deliberately narrow (a handful of
# literal terms, easily evaded by synonyms/misspellings/other languages) and
# NOT a substitute for real moderation. It exists to catch the most obvious
# cases before spending a provider call. The real backstop is the provider
# moderation endpoint below, which only runs when OPENAI_API_KEY is
# configured — a deployment running without that key has *no* substantive
# moderation beyond this list, which is a product/legal decision to sign
# off on explicitly, not something this comment alone should be taken as
# clearing.
#
# Shared by both surfaces that accept free-text prompts (imagegen and
# providers/chat) so there is exactly one blocklist to maintain, not two
# that can silently drift apart.
_MINOR_TERMS = r"(?:child|kid|minor|toddler|infant|underage)"
_SEXUAL_TERMS = r"(?:nude|naked|sexual|sex)"
BLOCKED_PATTERNS = [
    re.compile(rf"\b{_MINOR_TERMS}\b[\s\S]{{0,40}}\b{_SEXUAL_TERMS}\b", re.IGNORECASE),
    re.compile(rf"\b{_SEXUAL_TERMS}\b[\s\S]{{0,40}}\b{_MINOR_TERMS}\b", re.IGNORECASE),
    re.compile(rf"\b{_MINOR_TERMS}\s*(sexual|porn|abuse)", re.IGNORECASE),
]


class ModerationBlocked(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def check_prompt(prompt: str) -> None:
    for pattern in BLOCKED_PATTERNS:
        if pattern.search(prompt):
            raise ModerationBlocked("Prompt matched a blocked pattern")

    if not settings.OPENAI_API_KEY:
        # No provider key configured (dev/mock environment) — the regex
        # prefilter above is the only check available.
        return

    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=10)
    result = client.moderations.create(input=prompt)
    if result.results[0].flagged:
        raise ModerationBlocked("Flagged by provider moderation endpoint")
