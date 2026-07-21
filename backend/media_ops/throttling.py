from rest_framework.throttling import UserRateThrottle


class MediaOpsRateThrottle(UserRateThrottle):
    scope = "media_ops"
