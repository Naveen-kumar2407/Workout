"""Generate self-signed TLS certs so mobile browsers allow camera (HTTPS required)."""

from __future__ import annotations

import ipaddress
from datetime import datetime, timedelta, timezone
from pathlib import Path


def ensure_ssl_certificates(
    cert_dir: Path,
    hostnames: list[str] | None = None,
    ip_addresses: list[str] | None = None,
) -> tuple[str, str]:
    cert_dir.mkdir(parents=True, exist_ok=True)
    key_path = cert_dir / "key.pem"
    cert_path = cert_dir / "cert.pem"

    if key_path.exists() and cert_path.exists():
        return str(key_path), str(cert_path)

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    hostnames = hostnames or ["localhost"]
    ip_addresses = ip_addresses or ["127.0.0.1"]

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, hostnames[0]),
    ])

    san: list[x509.GeneralName] = []
    for name in hostnames:
        san.append(x509.DNSName(name))
    for ip in ip_addresses:
        try:
            san.append(x509.IPAddress(ipaddress.ip_address(ip)))
        except ValueError:
            pass

    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .sign(key, hashes.SHA256())
    )

    key_path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return str(key_path), str(cert_path)
