# Moved to core.moderation so imagegen (image prompts) and providers (chat
# prompts) share exactly one blocklist instead of two that could drift
# apart. Re-exported here so existing imports (imagegen.tasks,
# imagegen.tests) keep working unchanged.
from core.moderation import BLOCKED_PATTERNS, ModerationBlocked, check_prompt

__all__ = ["BLOCKED_PATTERNS", "ModerationBlocked", "check_prompt"]
