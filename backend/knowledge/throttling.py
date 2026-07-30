from rest_framework.throttling import UserRateThrottle


class KnowledgeRateThrottle(UserRateThrottle):
    scope = "knowledge"
