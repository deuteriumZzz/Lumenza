# Перенесено в core.moderation, чтобы imagegen (промпты изображений) и
# providers (промпты чата) использовали ровно один общий чёрный список
# вместо двух, которые могли бы разойтись. Реэкспортируется здесь, чтобы
# существующие импорты (imagegen.tasks, imagegen.tests) продолжали
# работать без изменений.
from core.moderation import BLOCKED_PATTERNS, ModerationBlocked, check_prompt

__all__ = ["BLOCKED_PATTERNS", "ModerationBlocked", "check_prompt"]
