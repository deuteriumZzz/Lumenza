from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Installs the latest Python runtime on the self-hosted Piston "
        "instance (docker-compose.yml `piston` service) — a one-time step "
        "after that service is up, not something run on every deploy. "
        "Piston ships with no languages preinstalled."
    )

    def handle(self, *args, **options):
        if not settings.PISTON_API_URL:
            raise CommandError(
                "PISTON_API_URL is not set — start the `piston` compose "
                "service and set PISTON_API_URL=http://piston:2000 first"
            )

        import requests

        packages_url = f"{settings.PISTON_API_URL}/api/v2/packages"
        response = requests.get(packages_url, timeout=15)
        response.raise_for_status()
        python_packages = [
            entry
            for entry in response.json()
            if entry["language"] == "python"
        ]
        if not python_packages:
            raise CommandError(
                "Piston reported no installable python package — is the "
                "instance still starting up?"
            )

        installed = [p for p in python_packages if p["installed"]]
        if installed:
            version = installed[0]["language_version"]
            self.stdout.write(
                self.style.SUCCESS(f"Python already installed: {version}")
            )
            return

        def _version_key(entry):
            # Lexicographic string comparison would rank "3.9.4" above
            # "3.12.0" — split into ints so this picks the real latest.
            return tuple(
                int(part) if part.isdigit() else 0
                for part in entry["language_version"].split(".")
            )

        latest = max(python_packages, key=_version_key)
        install_response = requests.post(
            packages_url,
            json={
                "language": "python",
                "version": latest["language_version"],
            },
            timeout=120,
        )
        install_response.raise_for_status()
        self.stdout.write(
            self.style.SUCCESS(
                f"Installed python {latest['language_version']} on Piston"
            )
        )
