import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

from aiohttp.abc import AbstractResolver


class UnsafeTarget(ValueError):
    pass


def validate_url(url: str) -> str:
    try:
        parsed = urlsplit(url)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError as error:
        raise UnsafeTarget("Invalid URL") from error

    if parsed.scheme not in {"http", "https"} or not hostname:
        raise UnsafeTarget("Only HTTP and HTTPS URLs are supported")

    if parsed.username is not None or parsed.password is not None or parsed.fragment:
        raise UnsafeTarget("Credentials and fragments are not supported")

    if port is not None and port not in {80, 443}:
        raise UnsafeTarget("Only ports 80 and 443 are supported")

    hostname = hostname.rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
        raise UnsafeTarget("Local addresses are not allowed")

    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        if "." not in hostname:
            raise UnsafeTarget("A public hostname is required") from None
    else:
        if not address.is_global:
            raise UnsafeTarget("Private and reserved addresses are not allowed")

    return url


class PublicResolver(AbstractResolver):
    async def resolve(self, host: str, port: int = 0, family: socket.AddressFamily = socket.AF_UNSPEC):
        results = await asyncio.to_thread(
            socket.getaddrinfo, host, port, family, socket.SOCK_STREAM
        )

        addresses = []
        for family_value, _, protocol, _, address_info in results:
            address = address_info[0]
            if not ipaddress.ip_address(address).is_global:
                raise UnsafeTarget("Private and reserved DNS destinations are not allowed")
            addresses.append({
                "hostname": host,
                "host": address,
                "port": address_info[1],
                "family": family_value,
                "proto": protocol,
                "flags": socket.AI_NUMERICHOST,
            })

        if not addresses:
            raise UnsafeTarget("No public address found")

        return addresses

    async def close(self) -> None:
        return None
