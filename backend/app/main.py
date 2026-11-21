from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes import simulation, network, controllers, referee, scenarios, comparison

app = FastAPI(
    title="RANGUARD — Autonomous Mobile Network Conflict-Resolution Referee",
    description="Deterministic mobile network simulator with independent controllers, shadow simulation, safety guardrails, and multi-objective arbitration.",
    version="1.0.0",
)

# Enable CORS for local frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(simulation.router)
app.include_router(network.router)
app.include_router(controllers.router)
app.include_router(referee.router)
app.include_router(scenarios.router)
app.include_router(comparison.router)


@app.get("/api/health", summary="Health check endpoint")
def health_check():
    return {
        "status": "healthy",
        "service": "ranguard-backend",
        "version": "1.0.0",
    }
