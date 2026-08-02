from rest_framework.throttling import UserRateThrottle

# Заметно строже, чем imagegen.throttling.ImageGenerationRateThrottle
# (20/min) — вызов видео стоит существенно дороже и занимает воркер
# ощутимо дольше одной картинки, так что тот же лимит скопировал бы сюда
# неоправданно щедрый бюджет. Намеренно, не забытая копипаста.
#
# Отдельно: ни у одной Celery-задачи в проекте не настроен
# task_time_limit/soft_time_limit — генерация видео (потенциально 1-5
# минут) занимает слот воркера намного дольше картинки (пара секунд), что
# на небольшом пуле воркеров — реальный вопрос пропускной способности.
# Вне рамок этого изменения, но стоит держать в уме.
class VideoGenerationRateThrottle(UserRateThrottle):
    scope = "video_generation"
