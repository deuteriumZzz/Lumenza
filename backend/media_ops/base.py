from dataclasses import dataclass


@dataclass
class TranscriptionResult:
    text: str
    cost_usd: float
    model: str
    mocked: bool = False


@dataclass
class SpeechResult:
    audio_bytes: bytes
    cost_usd: float
    model: str
    mocked: bool = False


@dataclass
class DocumentResult:
    text: str
    cost_usd: float
    model: str
    mocked: bool = False
