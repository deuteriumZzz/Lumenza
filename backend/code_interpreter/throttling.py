from rest_framework.throttling import UserRateThrottle


class CodeInterpreterRateThrottle(UserRateThrottle):
    scope = "code_interpreter"
