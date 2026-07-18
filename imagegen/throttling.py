from rest_framework.throttling import UserRateThrottle


class ImageGenerationRateThrottle(UserRateThrottle):
    scope = "image_generation"
