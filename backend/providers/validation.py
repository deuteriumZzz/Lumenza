MAX_PROVIDER_TOKEN_COUNT = 1_000_000


def validate_token_count(value: object, field_name: str) -> int:
    if type(value) is not int or value < 0 or value > MAX_PROVIDER_TOKEN_COUNT:
        raise ValueError(f"Invalid {field_name} token count")
    return value
