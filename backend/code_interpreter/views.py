from rest_framework import generics, status
from rest_framework.decorators import (
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from code_interpreter.models import CodeExecution
from code_interpreter.serializers import (
    CodeExecutionRequestSerializer,
    CodeExecutionSerializer,
)
from code_interpreter.services import start_code_execution
from code_interpreter.throttling import CodeInterpreterRateThrottle
from core.responses import locked_or as _locked_or


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([CodeInterpreterRateThrottle])
def create_code_execution(request):
    serializer = CodeExecutionRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = start_code_execution(
        request.user, serializer.validated_data["code"]
    )
    ok = (
        Response(
            CodeExecutionSerializer(outcome.record).data,
            status=status.HTTP_202_ACCEPTED,
        )
        if outcome.record
        else None
    )
    return _locked_or(outcome, ok)


class CodeExecutionDetailView(generics.RetrieveAPIView):
    serializer_class = CodeExecutionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CodeExecution.objects.filter(user=self.request.user)
