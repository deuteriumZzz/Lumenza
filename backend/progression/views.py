from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from progression.serializers import (
    ModelProgressSerializer,
    ResourceProgressSerializer,
)
from progression.services import (
    get_model_progress,
    get_progress,
    get_unlocked_keys,
)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def progress(request):
    user = request.user
    return Response(
        {
            "tier": user.tier,
            "unlocked": sorted(get_unlocked_keys(user)),
            "progress": ResourceProgressSerializer(
                get_progress(user), many=True
            ).data,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def models_progress(request, task):
    return Response(
        ModelProgressSerializer(
            get_model_progress(request.user, task), many=True
        ).data
    )
