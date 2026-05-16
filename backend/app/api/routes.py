from fastapi import APIRouter

from app.api import (
    appointments,
    assistant,
    auth,
    clients,
    measurements,
    plans,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(clients.router, prefix="/clients", tags=["clients"])
api_router.include_router(measurements.router, tags=["measurements"])
api_router.include_router(plans.router, prefix="/plans", tags=["plans"])
api_router.include_router(appointments.router, prefix="/appointments", tags=["appointments"])
api_router.include_router(assistant.router, prefix="/assistant", tags=["assistant"])
