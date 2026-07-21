from rest_framework import generics, status
from rest_framework.decorators import (
    api_view,
    parser_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.responses import locked_or as _locked_or
from media_ops.models import (
    DocumentExtraction,
    PhotoAnalysis,
    SpeechClip,
    Transcription,
)
from media_ops.serializers import (
    DocumentExtractionRequestSerializer,
    DocumentExtractionSerializer,
    PhotoAnalysisRequestSerializer,
    PhotoAnalysisSerializer,
    SpeechClipSerializer,
    SpeechRequestSerializer,
    TranscriptionRequestSerializer,
    TranscriptionSerializer,
)
from media_ops.services import (
    start_document_extraction,
    start_photo_analysis,
    start_speech,
    start_transcription,
)
from media_ops.throttling import MediaOpsRateThrottle


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
@throttle_classes([MediaOpsRateThrottle])
def create_transcription(request):
    serializer = TranscriptionRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = start_transcription(
        request.user, serializer.validated_data["audio"]
    )
    ok = (
        Response(
            TranscriptionSerializer(outcome.record).data,
            status=status.HTTP_202_ACCEPTED,
        )
        if outcome.record
        else None
    )
    return _locked_or(outcome, ok)


class TranscriptionDetailView(generics.RetrieveAPIView):
    serializer_class = TranscriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Transcription.objects.filter(user=self.request.user)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([MediaOpsRateThrottle])
def create_speech(request):
    serializer = SpeechRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = start_speech(request.user, serializer.validated_data["text"])
    ok = (
        Response(
            SpeechClipSerializer(outcome.record).data,
            status=status.HTTP_202_ACCEPTED,
        )
        if outcome.record
        else None
    )
    return _locked_or(outcome, ok)


class SpeechClipDetailView(generics.RetrieveAPIView):
    serializer_class = SpeechClipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SpeechClip.objects.filter(user=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
@throttle_classes([MediaOpsRateThrottle])
def create_document_extraction(request):
    serializer = DocumentExtractionRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = start_document_extraction(
        request.user, serializer.validated_data["document"]
    )
    ok = (
        Response(
            DocumentExtractionSerializer(outcome.record).data,
            status=status.HTTP_202_ACCEPTED,
        )
        if outcome.record
        else None
    )
    return _locked_or(outcome, ok)


class DocumentExtractionDetailView(generics.RetrieveAPIView):
    serializer_class = DocumentExtractionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DocumentExtraction.objects.filter(user=self.request.user)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
@throttle_classes([MediaOpsRateThrottle])
def create_photo_analysis(request):
    serializer = PhotoAnalysisRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = start_photo_analysis(
        request.user, serializer.validated_data["image"]
    )
    ok = (
        Response(
            PhotoAnalysisSerializer(outcome.record).data,
            status=status.HTTP_202_ACCEPTED,
        )
        if outcome.record
        else None
    )
    return _locked_or(outcome, ok)


class PhotoAnalysisDetailView(generics.RetrieveAPIView):
    serializer_class = PhotoAnalysisSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PhotoAnalysis.objects.filter(user=self.request.user)
