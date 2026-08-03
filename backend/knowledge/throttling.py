from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class KnowledgeRateThrottle(UserRateThrottle):
    scope = "knowledge"


class EmbedAskThrottle(SimpleRateThrottle):
    """Keys on the embed widget's public_key, not request.user — the
    caller is an anonymous website visitor, there is no Lumenza session
    to key on. This deliberately rate-limits the whole widget, not each
    visitor individually: the answer-synthesis call is billed to the
    workspace owner (see knowledge.views.embed_ask_view), so a per-widget
    ceiling is the guard against anonymous traffic draining the owner's
    credits, not an anti-spam feature per visitor."""

    scope = "embed_ask"

    def get_cache_key(self, request, view):
        public_key = view.kwargs.get("public_key", "")
        return self.cache_format % {
            "scope": self.scope,
            "ident": public_key,
        }
