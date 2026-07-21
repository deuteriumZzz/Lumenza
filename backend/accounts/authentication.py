from django.conf import settings
from rest_framework.authentication import CSRFCheck, TokenAuthentication
from rest_framework.exceptions import PermissionDenied


class CookieTokenAuthentication(TokenAuthentication):
    """Читает токен авторизации DRF из httpOnly cookie (выставляется
    accounts.views на login/register) вместо заголовка Authorization.
    Фронтенд вообще никогда не получает значение токена — в отличие от
    токена в localStorage, его нельзя прочитать (и украсть для дальнейшего
    использования) через XSS-пейлоад или вредоносное расширение браузера,
    работающее в JS-контексте страницы.

    Проверяет CSRF на небезопасных методах точно так же, как это делает
    собственный SessionAuthentication у DRF для cookie-based аутентификации:
    в отличие от заголовка (который страница атакующего не может выставить
    на межсайтовом запросе без уже имеющегося доступа с того же origin),
    браузер прикрепляет эту cookie автоматически, так что нужно ещё и
    предъявить валидный CSRF-токен.
    """

    def authenticate(self, request):
        token_key = request.COOKIES.get(settings.AUTH_TOKEN_COOKIE_NAME)
        if not token_key:
            return None
        user, token = self.authenticate_credentials(token_key)
        self._enforce_csrf(request)
        return (user, token)

    def _enforce_csrf(self, request):
        def dummy_get_response(request):
            return None

        check = CSRFCheck(dummy_get_response)
        # Заполняет request.META["CSRF_COOKIE"], читается в process_view
        # ниже.
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise PermissionDenied(f"CSRF Failed: {reason}")
