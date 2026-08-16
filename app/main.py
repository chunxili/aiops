from fastapi import FastAPI

from app.routes import agent_router, tools_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="AWS Platform Agent",
        version="0.1.0",
        description="Read-only AWS platform assistant MVP.",
    )
    app.include_router(agent_router)
    app.include_router(tools_router)

    @app.get("/")
    async def root() -> dict[str, object]:
        return {
            "service": "aws-platform-agent",
            "status": "ok",
            "entrypoint": "/api/agent/chat",
            "docs": "/docs",
        }

    return app


app = create_app()
