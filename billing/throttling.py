from rest_framework.throttling import UserRateThrottle


class SandboxTopupRateThrottle(UserRateThrottle):
    scope = "sandbox_topup"


class TopupRateThrottle(UserRateThrottle):
    scope = "topup"
