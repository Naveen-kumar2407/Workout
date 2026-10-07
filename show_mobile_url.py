"""Print the URL to open the mobile app on your phone (same Wi-Fi)."""

import socket

PORT = 8000


def local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    ip = local_ip()
    print("\n  Mobile app URL (open on your phone):\n")
    print(f"  http://{ip}:{PORT}/mobile\n")
    print("  Then: Add to Home Screen to install as app.\n")
