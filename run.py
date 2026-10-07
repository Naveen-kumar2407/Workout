"""Start the 3D Biomechanical Multi-Person Coach server (HTTPS for mobile camera)."""

import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))


def local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def find_free_port(start: int = 8000, end: int = 8010) -> int:
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port between {start} and {end}. Close other servers and retry.")


if __name__ == "__main__":
    import uvicorn

    from backend.ssl_certs import ensure_ssl_certificates

    port = find_free_port()
    ip = local_ip()

    keyfile, certfile = ensure_ssl_certificates(
        ROOT / "certs",
        hostnames=["localhost", "posture-coach.local"],
        ip_addresses=["127.0.0.1", ip],
    )

    print("\n  3D Biomechanical Multi-Person Coach")
    print(f"  Desktop: https://127.0.0.1:{port}")
    print(f"  Mobile:  https://{ip}:{port}/mobile  (same Wi-Fi)")
    print("\n  On your phone: use HTTPS (not http).")
    print("  Accept the certificate warning once — required for camera.\n")

    if port != 8000:
        print(f"  (Port 8000 was busy — using {port} instead)\n")

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        ssl_keyfile=keyfile,
        ssl_certfile=certfile,
    )
