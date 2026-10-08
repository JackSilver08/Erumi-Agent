import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("erumi.worker")


async def main() -> None:
    logger.info("Erumi worker started. Queue integration will attach here.")
    while True:
        await asyncio.sleep(30)


if __name__ == "__main__":
    asyncio.run(main())
