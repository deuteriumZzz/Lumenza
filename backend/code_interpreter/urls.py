from django.urls import path

from code_interpreter.views import (
    CodeExecutionDetailView,
    create_code_execution,
)

urlpatterns = [
    path(
        "code/executions/",
        create_code_execution,
        name="create-code-execution",
    ),
    path(
        "code/executions/<int:pk>/",
        CodeExecutionDetailView.as_view(),
        name="code-execution-detail",
    ),
]
