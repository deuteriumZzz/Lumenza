from pathlib import Path


def resolve_media_root(
    *,
    base_dir: Path,
    configured_root: str,
    serve_media_files: bool,
    debug: bool,
) -> Path:
    explicit_root = configured_root.strip()
    if serve_media_files and not debug and not explicit_root:
        raise RuntimeError(
            "MEDIA_ROOT must be set explicitly when SERVE_MEDIA_FILES=True "
            "and DEBUG=False"
        )
    return Path(explicit_root) if explicit_root else base_dir / "media"
